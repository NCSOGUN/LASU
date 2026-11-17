"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Alert } from "@/components/arc/alert/alert";
import { Button } from "@/components/arc/button/button";
import { OtpInput } from "@/components/arc/otp-input/otp-input";
import { PhoneInput, formatPhoneNumber } from "@/components/arc/phone-input/phone-input";
import { useBeginPhoneVerification, useConfirmPhoneVerification } from "@/api/hooks/channels";
import { ApiError, toApiError } from "@/api/errors";
import { isE164Phone } from "./channel-data";
import { RequestError } from "./RequestError";
import styles from "./channels.module.css";

const DEFAULT_RESEND_SECONDS = 60;
const MAX_ATTEMPTS = 5;

type Step = "phone" | "code" | "verified";

export function PhoneVerification({
  onVerified,
  resendSeconds = DEFAULT_RESEND_SECONDS,
}: {
  onVerified: (verifiedAt: string) => void;
  /** Resend wait in seconds. The screen uses the default 60 second timer. */
  resendSeconds?: number;
}) {
  const begin = useBeginPhoneVerification();
  const confirm = useConfirmPhoneVerification();

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [phoneIsValid, setPhoneIsValid] = useState(false);
  const [phoneError, setPhoneError] = useState<string>();
  const [code, setCode] = useState("");
  const [otpError, setOtpError] = useState<string>();
  const [attempts, setAttempts] = useState(0);
  const [resendIn, setResendIn] = useState(0);
  const [sendError, setSendError] = useState<unknown>();
  const [confirmError, setConfirmError] = useState<unknown>();
  const [resetNotice, setResetNotice] = useState<string>();
  const [announcement, setAnnouncement] = useState<string>();

  const phoneRef = useRef<HTMLInputElement>(null);
  const focusPhoneNext = useRef(false);
  const verifyAnotherRef = useRef<HTMLButtonElement>(null);

  // The code is only ever in component state. It is cleared on every exit path.
  useEffect(() => {
    if (step !== "code") return;
    const timer = window.setInterval(() => {
      setResendIn((seconds) => (seconds > 0 ? seconds - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [step]);

  useEffect(() => {
    if (step === "phone" && focusPhoneNext.current) {
      focusPhoneNext.current = false;
      phoneRef.current?.focus();
    }
  }, [step]);

  useEffect(() => {
    if (step === "verified") verifyAnotherRef.current?.focus();
  }, [step]);

  function enterPhoneStep() {
    focusPhoneNext.current = true;
    setStep("phone");
    setCode("");
    setOtpError(undefined);
    setConfirmError(undefined);
    setAttempts(0);
    setResendIn(0);
    setResetNotice(undefined);
    setAnnouncement(undefined);
  }

  async function requestCode(isResend: boolean) {
    if (begin.isPending) return;

    setSendError(undefined);
    setResetNotice(undefined);
    setPhoneError(undefined);

    if (!phone) {
      setPhoneError("Enter a phone number.");
      return;
    }
    if (!phoneIsValid || !isE164Phone(phone)) {
      setPhoneError("Enter a complete phone number with its country code.");
      return;
    }

    try {
      await begin.mutateAsync({ phone });
      setStep("code");
      setCode("");
      setOtpError(undefined);
      setConfirmError(undefined);
      setAttempts(0);
      setResendIn(resendSeconds);
      setAnnouncement(isResend ? `A new code was sent to ${formatPhoneNumber(phone)}.` : undefined);
    } catch (error) {
      setSendError(error);
    }
  }

  function sendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void requestCode(false);
  }

  async function verifyCode(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (confirm.isPending) return;

    setOtpError(undefined);
    setConfirmError(undefined);

    if (!/^\d{6}$/.test(code)) {
      setOtpError("Enter the 6-digit code from the SMS.");
      return;
    }

    try {
      const result = await confirm.mutateAsync({ phone, code });
      if (!result.verified) {
        throw new ApiError({ status: 0, code: "invalid_response" });
      }
      setCode("");
      setStep("verified");
      setResendIn(0);
      setAttempts(0);
      setAnnouncement(undefined);
      onVerified(result.phone_verified_at);
    } catch (error) {
      const apiError = toApiError(error);
      if (apiError.code !== "invalid_code") {
        setConfirmError(apiError);
        return;
      }

      const nextAttempts = attempts + 1;
      setCode("");
      if (nextAttempts >= MAX_ATTEMPTS) {
        focusPhoneNext.current = true;
        setAttempts(0);
        setStep("phone");
        setResendIn(0);
        setOtpError(undefined);
        setAnnouncement(undefined);
        setResetNotice("Too many incorrect codes. Send a new code to start again.");
        return;
      }

      setAttempts(nextAttempts);
      setOtpError(apiError.message);
    }
  }

  const triesLeft = Math.max(0, MAX_ATTEMPTS - attempts);
  const otpDescription =
    attempts > 0
      ? `You have ${triesLeft} ${triesLeft === 1 ? "try" : "tries"} left before you need a new code.`
      : "Enter the 6-digit code from the SMS.";

  return (
    <section id="phone-verification" className={styles.card} aria-labelledby="phone-title">
      <div className={styles.cardHead}>
        <h2 id="phone-title" className={styles.cardTitle}>
          Phone number
        </h2>
        <p className={styles.cardCopy}>
          We send a 6-digit code by SMS to confirm the number. Codes expire after 10 minutes. This page never
          stores the code.
        </p>
      </div>

      {resetNotice ? (
        <Alert tone="danger" title="Start again">
          {resetNotice}
        </Alert>
      ) : null}

      {step === "verified" ? (
        <>
          <Alert tone="success" title="Phone verified">
            {formatPhoneNumber(phone)} is confirmed. You can allow SMS and USSD below.
          </Alert>
          <div className={styles.actions}>
            <Button ref={verifyAnotherRef} variant="secondary" onClick={enterPhoneStep}>
              Verify another number
            </Button>
          </div>
        </>
      ) : step === "phone" ? (
        <>
          <form className={styles.form} onSubmit={sendCode} noValidate>
            <PhoneInput
              ref={phoneRef}
              id="phone-number"
              label="Phone number"
              name="phone"
              value={phone}
              onValueChange={(value, details) => {
                setPhone(value);
                setPhoneIsValid(details.valid);
                if (phoneError) setPhoneError(undefined);
                if (sendError) setSendError(undefined);
              }}
              defaultCountry="NG"
              preferredCountries={["NG", "GB", "US"]}
              description="Include the country code. We only use this number for SMS and USSD."
              error={phoneError}
              required
            />
            <div className={styles.actions}>
              <Button type="submit" loading={begin.isPending}>
                Send code
              </Button>
            </div>
          </form>
          {sendError ? (
            <RequestError
              title="Could not send the code"
              error={sendError}
              onRetry={() => void requestCode(false)}
            />
          ) : null}
        </>
      ) : (
        <>
          <p className={styles.phoneSummary} role="status">
            Code sent to <strong>{formatPhoneNumber(phone)}</strong>.
          </p>
          <form className={styles.form} onSubmit={verifyCode} noValidate>
            <OtpInput
              label="Verification code"
              value={code}
              onChange={(value) => {
                setCode(value);
                if (otpError) setOtpError(undefined);
                if (confirmError) setConfirmError(undefined);
              }}
              description={otpDescription}
              error={otpError}
              autoFocus
            />
            <div className={styles.actions}>
              <Button type="submit" loading={confirm.isPending}>
                Verify code
              </Button>
              <Button
                type="button"
                variant="secondary"
                loading={begin.isPending}
                disabled={resendIn > 0}
                onClick={() => void requestCode(true)}
              >
                {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
              </Button>
              <Button type="button" variant="ghost" onClick={enterPhoneStep}>
                Change number
              </Button>
            </div>
          </form>
          {announcement ? (
            <p className={styles.status} role="status">
              {announcement}
            </p>
          ) : null}
          {confirmError ? (
            <RequestError
              title="Could not verify the code"
              error={confirmError}
              onRetry={() => void verifyCode()}
            />
          ) : null}
          {sendError ? (
            <RequestError
              title="Could not send a new code"
              error={sendError}
              onRetry={() => void requestCode(true)}
            />
          ) : null}
        </>
      )}
    </section>
  );
}
