"use server";
import {
  BillData,
  Device,
  DeviceWiseEnergyData,
  EnergyComparison,
  MaxPercentIncrease,
  OverallEnergyData,
  ServiceLocation,
} from "@/interfaces/interface";
import { getAuthSessionCookie, useUser } from "./useSessionHook";

export async function getLocations() {
  const authSession = getAuthSessionCookie();
  const user = await useUser();
  const req = await fetch(
    `${process.env.API_URL}/locations/${user?.customerId}`,
    {
      next: {
        tags: ["getLocations"],
      },
      headers: {
        Origin: process.env.API_URL!,
        Host: process.env.API_HOST!,
        Cookie: `auth_session=${authSession?.value}`,
      },
    }
  );
  const data: { customerId: number; serviceLocations: ServiceLocation[] } =
    await req.json();
  return data?.serviceLocations;
}

export async function getDevices() {
  const authSession = getAuthSessionCookie();
  const user = await useUser();
  const req = await fetch(
    `${process.env.API_URL}/devices/customer/${user?.customerId}`,
    {
      next: {
        tags: ["getDevices"],
      },
      headers: {
        Origin: process.env.API_URL!,
        Host: process.env.API_HOST!,
        Cookie: `auth_session=${authSession?.value}`,
      },
    }
  );
  const data: { devices: Device[]; customerId: number } = await req.json();
  return data?.devices;
}

export async function getModels() {
  const authSession = getAuthSessionCookie();
  const req = await fetch(`${process.env.API_URL}/models`, {
    method: "GET",
    next: {
      tags: ["getModels"],
    },
    headers: {
      Origin: process.env.API_URL!,
      Host: process.env.API_HOST!,
      Cookie: `auth_session=${authSession?.value}`,
    },
  });
  const data: Record<string, string[]> = await req.json();
  return new Map(Object.entries(data));
}

export async function getMaxPercentIncrease(customerId: number) {
  const authSession = getAuthSessionCookie();
  const req = await fetch(
    `${process.env.API_URL}/devicedata/percentincrease?customerId=${customerId}`,
    {
      method: "GET",
      next: {
        tags: ["getMaxPercentIncrease"],
      },
      headers: {
        Origin: process.env.API_URL!,
        Host: process.env.API_HOST!,
        Cookie: `auth_session=${authSession?.value}`,
      },
    }
  );
  const data: MaxPercentIncrease = await req.json();
  return data;
}

export async function getEnergyComparisonData(customerId: number) {
  const comparisonReq = await fetch(
    `${process.env.API_URL}/devicedata/comparison?customerId=${customerId}`,
    {
      next: {
        tags: [`getEnergyComparison-${customerId}`],
      },
    }
  );
  const comparisonData: { energyComparisons: EnergyComparison[] } =
    await comparisonReq.json();
  return comparisonData?.energyComparisons;
}

export async function getOverallEnergyData(customerId: number, period: string) {
  const energyReq = await fetch(
    `${process.env.API_URL}/devicedata/overall?customerId=${customerId}&period=${period}`,
    {
      next: {
        tags: [`getOverallEnergyData-${customerId}`],
      },
    }
  );
  const res: { overallEnergyData: OverallEnergyData[] } =
    await energyReq.json();
  return res.overallEnergyData;
}

export async function getOverallEnergy(customerId: number) {
  const overallEnergyConsumptionAllTime = await getOverallEnergyData(
    customerId,
    "all"
  );

  const overallEnergyConsumptionDaily = await getOverallEnergyData(
    customerId,
    "daily"
  );

  const overallEnergyConsumptionWeekly = await getOverallEnergyData(
    customerId,
    "weekly"
  );

  const overallEnergyConsumptionHourly = await getOverallEnergyData(
    customerId,
    "hourly"
  );

  const overallEnergyConsumption = {
    daily: overallEnergyConsumptionDaily,
    weekly: overallEnergyConsumptionWeekly,
    hourly: overallEnergyConsumptionHourly,
    all: overallEnergyConsumptionAllTime,
  };

  return overallEnergyConsumption;
}

export async function getDeviceWiseEnergyData(
  customerId: number,
  devices: number[]
) {
  const deviceWiseEnergyReq = await fetch(
    `${process.env.API_URL}/devicedata/device?customerId=${customerId}`,
    {
      next: {
        tags: [`getDeviceWiseEnergyData-${customerId}`],
      },
    }
  );
  const res: { deviceWiseEnergyData: Record<string, DeviceWiseEnergyData[]> } =
    await deviceWiseEnergyReq.json();
  return res.deviceWiseEnergyData;
}

export async function getBillData(customerId: number) {
  const billReq = await fetch(
    `${process.env.API_URL}/devicedata/bill?customerId=${customerId}`,
    {
      next: {
        tags: [`getBillData-${customerId}`],
      },
    }
  );
  const res: BillData = await billReq.json();
  return res;
}
