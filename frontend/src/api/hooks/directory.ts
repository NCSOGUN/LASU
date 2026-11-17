"use client";

import { useQuery } from "@tanstack/react-query";
import { request } from "../client";
import { qk } from "../keys";
import {
  areasResponseSchema,
  facilitiesResponseSchema,
  facilityDetailSchema,
  servicesResponseSchema,
} from "../schemas";

export interface FacilitiesQuery {
  service: string;
  areaId: string;
  radius: number;
  limit: number;
}

export function useServices() {
  return useQuery({
    queryKey: qk.services,
    queryFn: () => request({ url: "/directory/services", method: "GET" }, servicesResponseSchema),
  });
}

export function useAreas(query: string, enabled = true) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: qk.areas(trimmed),
    queryFn: () =>
      request(
        {
          url: "/directory/areas",
          method: "GET",
          params: { q: trimmed || undefined, limit: 10 },
        },
        areasResponseSchema,
      ),
    enabled,
  });
}

export function useFacilities({ service, areaId, radius, limit }: FacilitiesQuery) {
  return useQuery({
    queryKey: qk.facilities({ service, areaId, radius, limit }),
    queryFn: () =>
      request(
        {
          url: "/directory/facilities",
          method: "GET",
          params: { service, area_id: areaId, radius_km: radius, limit },
        },
        facilitiesResponseSchema,
      ),
  });
}

export function useFacility(id: string) {
  return useQuery({
    queryKey: qk.facility(id),
    queryFn: () =>
      request(
        { url: `/directory/facilities/${encodeURIComponent(id)}`, method: "GET" },
        facilityDetailSchema,
      ),
  });
}
