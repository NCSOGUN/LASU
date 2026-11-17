"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { Alert } from "@/components/arc/alert/alert";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { useChannelFields, useStoredConsent } from "@/api/hooks/channels";
import { fieldsWithValues } from "./channel-data";
import { PhoneVerification } from "./PhoneVerification";
import { ConsentCard } from "./ConsentCard";
import { RequestError } from "./RequestError";
import styles from "./channels.module.css";

function subscribeToOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getOnlineSnapshot() {
  return navigator.onLine;
}

function getServerOnlineSnapshot() {
  return true;
}

export function ChannelsScreen() {
  const fields = useChannelFields();
  const sms = useStoredConsent("SMS");
  const ussd = useStoredConsent("USSD");
  const online = useSyncExternalStore(subscribeToOnline, getOnlineSnapshot, getServerOnlineSnapshot);
  const [phoneVerifiedAt, setPhoneVerifiedAt] = useState<string | null>(null);

  const availableFields = fieldsWithValues(fields.data?.fields ?? []);
  const hasSavedPermission = Boolean(sms.data || ussd.data);

  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <h1 className={styles.title}>Channels</h1>
        <p className={styles.subtitle}>
          Verify a phone number, then allow SMS and USSD to read exactly the fields you choose, for a limited
          time.
        </p>
      </header>

      {!online ? (
        <Alert tone="warning" title="You are offline">
          Changes are not saved until you reconnect. Keep this page open and try again.
        </Alert>
      ) : null}

      <PhoneVerification onVerified={setPhoneVerifiedAt} />

      <section className={styles.section} aria-labelledby="consent-title">
        <div className={styles.sectionHead}>
          <h2 id="consent-title" className={styles.sectionTitle}>
            SMS and USSD permissions
          </h2>
          <p className={styles.sectionNote}>
            SMS and USSD read only the fields you allow. Nothing else in your record is available through
            them. This page shows permissions saved in this session because the API has no consent read
            endpoint yet.
          </p>
        </div>

        {hasSavedPermission ? (
          <Alert tone="success" title="Permissions saved">
            Your SMS and USSD permissions are saved. Re-open this page to change them.
          </Alert>
        ) : null}

        {fields.isLoading ? (
          <div className={styles.cards}>
            {(["SMS", "USSD"] as const).map((channel) => (
              <div className={styles.card} key={channel}>
                <Skeleton lines={5} label={`Loading ${channel} permission`} />
              </div>
            ))}
          </div>
        ) : fields.isError ? (
          <RequestError
            title="Could not load your fields"
            error={fields.error}
            onRetry={() => void fields.refetch()}
          />
        ) : availableFields.length === 0 ? (
          <EmptyState
            icon={<ClipboardList size={24} />}
            label="No fields to share"
            title="No fields to share yet"
            description="Add a field to your record before you allow SMS or USSD to read it."
            action={
              <Link className={styles.textLink} href="/app/record">
                Add a field
              </Link>
            }
          />
        ) : (
          <div className={styles.cards}>
            <ConsentCard channel="SMS" fields={availableFields} consent={sms.data} phoneVerifiedAt={phoneVerifiedAt} />
            <ConsentCard channel="USSD" fields={availableFields} consent={ussd.data} phoneVerifiedAt={phoneVerifiedAt} />
          </div>
        )}
      </section>
    </div>
  );
}
