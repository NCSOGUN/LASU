"use client";

import Link from "next/link";
import { Badge } from "@/components/arc/badge/badge";
import { Card } from "@/components/arc/card/card";
import type { FacilitySummary } from "@/api/schemas";
import { distanceFromCentre } from "./format";
import styles from "./care.module.css";

export function FacilityCard({ facility }: { facility: FacilitySummary }) {
  return (
    <Card title={facility.name} description={facility.address}>
      <div className={styles.cardBody}>
        <p className={styles.distance}>{distanceFromCentre(facility.distance_km)}</p>
        {facility.is_demo ? (
          <div className={styles.badgeRow}>
            <Badge tone="info" outline>
              Demo data
            </Badge>
          </div>
        ) : null}
        {facility.phone ? (
          <a
            className={styles.phone}
            href={`tel:${facility.phone}`}
            aria-label={`Call ${facility.name} on ${facility.phone}`}
          >
            {facility.phone}
          </a>
        ) : null}
        <Link
          className={styles.detailLink}
          href={`/facilities/${facility.id}`}
          aria-label={`View details for ${facility.name}`}
        >
          View details
        </Link>
      </div>
    </Card>
  );
}
