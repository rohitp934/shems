import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { auth, githubAuth } from "./lucia";
import { env } from "./env";
import { OAuthRequestError } from "@lucia-auth/oauth";
import { cors } from "hono/cors";
import prexit from "prexit";
import { sql } from "./db";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import devicedata from "./routes/data";
import models from "./routes/models";
import devices from "./routes/devices";

const app = new Hono();

app.use("/*", cors());

app.get("/", (c) =>
  c.json({
    message: "Hello World!",
  })
);

app.post("/signup", async (c) => {
  const body = await c.req.json();
  const schema = z.object({
    username: z.string().min(3).max(31),
    password: z.string().min(5).max(255),
    name: z.string().min(3).max(255),
    billingAddress: z.string().min(3).max(255),
  });
  const { username, password, name, billingAddress } = schema.parse(body);

  try {
    const customers = await sql`
        INSERT INTO customers
          (name, billingaddress)
        VALUES
          (${name}, ${billingAddress})
        RETURNING *
      `;
    console.log("Inserted a new customer", customers);
    const customerId = customers[0].customerid;
    const user = await auth.createUser({
      key: {
        providerId: "username",
        providerUserId: username.toLowerCase(),
        password,
      },
      attributes: {
        username,
        customer_id: customerId,
      },
    });
    const session = await auth.createSession({
      userId: user.userId,
      attributes: {},
    });
    const authRequest = auth.handleRequest(c);
    authRequest.setSession(session);
    return c.json(
      {
        message: "Signed up Successfully",
      },
      201
    );
  } catch (e) {
    console.error(e);
    return c.json(
      {
        message: "Username already taken",
      },
      400
    );
  }
});

app.post("/login", async (c) => {
  const body = await c.req.json();
  const schema = z.object({
    username: z.string().min(3).max(31),
    password: z.string().min(5).max(255),
  });
  const { username, password } = schema.parse(body);
  if (
    typeof username !== "string" ||
    username.length < 3 ||
    username.length > 31
  ) {
    return c.json({ message: "Invalid username" }, 400);
  }
  if (
    typeof password !== "string" ||
    password.length < 5 ||
    password.length > 255
  ) {
    return c.json({ message: "Invalid password" }, 400);
  }
  try {
    const key = await auth.useKey("username", username.toLowerCase(), password);
    const session = await auth.createSession({
      userId: key.userId,
      attributes: {},
    });

    const authRequest = auth.handleRequest(c);
    authRequest.setSession(session);

    return c.json({ message: "Logged in successfully!" }, 200);
  } catch (e) {
    console.error(e);
    return c.json({ message: "Incorrect username or password" }, 400);
  }
});

app.get("/login/github", async (c) => {
  const [url, state] = await githubAuth.getAuthorizationUrl();
  setCookie(c, "github_oauth_state", state, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 1000,
  });

  c.res.headers.set("Access-Control-Allow-Origin", env.CLIENT_URL);
  return c.redirect(url.toString());
});

app.get("/login/github/callback", async (c) => {
  const storedState = getCookie(c, "github_oauth_state");
  const state = c.req.query().state;
  const code = c.req.query().code;

  if (
    !storedState ||
    !state ||
    storedState !== state ||
    typeof code !== "string"
  ) {
    return c.json({ message: "Invalid state" }, 400);
  }

  try {
    const { getExistingUser, githubUser, createUser } =
      await githubAuth.validateCallback(code);

    const getUser = async () => {
      const existingUser = await getExistingUser();
      if (existingUser) return existingUser;
      const user = await createUser({
        attributes: {
          username: githubUser.login,
          customer_id: null,
        },
      });
      return user;
    };

    const user = await getUser();
    const session = await auth.createSession({
      userId: user.userId,
      attributes: {},
    });

    const authRequest = auth.handleRequest(c);
    authRequest.setSession(session);

    if (user.customer_id) {
      return c.redirect(`${env.CLIENT_URL}/dashboard`);
    }

    return c.redirect(`${env.CLIENT_URL}/complete-profile`);
  } catch (e) {
    if (e instanceof OAuthRequestError) {
      return c.json({ message: e.message }, 400);
    }
    return c.json({ message: "Internal Server Error" }, 500);
  }
});

app.put("/complete-profile", async (c) => {
  const authRequest = auth.handleRequest(c);
  const session = await authRequest.validate();
  if (!session) {
    return c.json({ message: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  const schema = z.object({
    name: z.string().min(3).max(255),
    billingAddress: z.string().min(3).max(255),
  });
  const { name, billingAddress } = schema.parse(body);

  const { userId } = session.user;
  // Insert into customers table
  const customers = await sql`
    INSERT INTO customers
      (name, billingaddress)
    VALUES
      (${name}, ${billingAddress})
    RETURNING *
  `;
  console.log("Inserted a new customer", customers);
  const customerId = customers[0].customerid;
  await auth.updateUserAttributes(userId, {
    username: session.user.username,
    customer_id: customerId,
  });

  return c.json({ message: "Profile completed successfully" });
});

app.post("/logout", async (c) => {
  const authRequest = auth.handleRequest(c);
  const session = await authRequest.validate(); // or `authRequest.validateBearerToken()`

  if (!session) {
    return c.json({ message: "Unauthorized" }, 401);
  }
  await auth.invalidateSession(session.sessionId);

  authRequest.setSession(null); // for session cookie

  // redirect back to login page
  return c.json({ message: "Logged out successfully" });
});

app.get("/user", async (context) => {
  const authRequest = auth.handleRequest(context);
  const session = await authRequest.validate(); // or `authRequest.validateBearerToken()`
  if (session) {
    const user = session.user;
    const { customer_id, username } = user;
    return context.json({ customerId: customer_id, username });
  }
  return context.json({ message: "Unauthorized" }, 401);
});

app.get("/validate-session", async (c) => {
  const authRequest = auth.handleRequest(c);
  const session = await authRequest.validate(); // or `authRequest.validateBearerToken()`
  if (session) {
    return c.json({ message: "Valid session", isValid: true });
  }
  return c.json({ message: "Invalid session", isValid: false }, 401);
});

app.get(
  "/locations/:customerId",
  zValidator(
    "param",
    z.object({
      customerId: z.string(),
    })
  ),
  async (c) => {
    const { customerId } = c.req.valid("param");
    const customerIdInt = z.coerce.number().parse(customerId);

    // Fetching all service locations for a customer
    const serviceLocations = await sql`
    SELECT *
    FROM servicelocations
    WHERE customerid = ${customerIdInt}
  `;
    console.log(
      `Fetched service locations for: ${customerId}`,
      serviceLocations
    );
    return c.json({
      customerId: customerIdInt,
      serviceLocations,
    });
  }
);

app.post("/location", async (c) => {
  const authRequest = auth.handleRequest(c);
  const session = await authRequest.validate();
  if (!session) {
    return c.json({ message: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  console.log("body", body);
  const columns = [
    "customerid",
    "locationtype",
    "address",
    "unitnumber",
    "dateacquired",
    "zipcode",
    "squarefootage",
    "numberofbedrooms",
    "numberofoccupants",
  ];
  const serviceLocation = await sql`
    INSERT INTO servicelocations
    ${sql(body, columns)}
  `;

  console.log("Inserted a new service location", serviceLocation);
  return c.json(
    {
      message: "Service location created successfully",
    },
    201
  );
});

app.delete(
  "/location/:locationId",
  zValidator("param", z.object({ locationId: z.string() })),
  async (c) => {
    const authRequest = auth.handleRequest(c);
    const session = await authRequest.validate();
    if (!session) {
      return c.json({ message: "Unauthorized" }, 401);
    }

    const { locationId } = c.req.param();
    const locationIdInt = z.coerce.number().parse(locationId);

    const serviceLocation = await sql`
    DELETE FROM servicelocations
    WHERE locationid = ${locationIdInt}
  `;

    console.log("Deleted service location", serviceLocation);
    return c.json(
      {
        message: "Service location deleted successfully",
      },
      200
    );
  }
);

app.route("/devicedata", devicedata);
app.route("/devices", devices);
app.route("/models", models);

prexit(async () => {
  if (env.NODE_ENV === "dev") {
    // await sql`DELETE FROM user_session;`;
    // await sql`DELETE FROM user_key;`;
    // await sql`DELETE FROM auth_user;`;
  }
  await sql.end();
});

export default app;
