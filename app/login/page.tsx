"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { loginLocalParent } from "@/lib/client-auth";

function MaterialIcon({
  children,
  filled = false,
  className = "",
}: {
  children: string;
  filled?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={
        filled
          ? {
              fontVariationSettings:
                '"FILL" 1, "wght" 650, "GRAD" 0, "opsz" 24',
            }
          : undefined
      }
    >
      {children}
    </span>
  );
}

export default function LoginPage() {
  const router = useRouter();

  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<
    "error" | "success" | ""
  >("");

  const [isLoading, setIsLoading] = useState(false);

  function showMessage(
    text: string,
    type: "error" | "success"
  ) {
    setMessage(text);
    setMessageType(type);

    window.setTimeout(() => {
      setMessage("");
      setMessageType("");
    }, 3500);
  }

  function handleMobileChange(value: string) {
    setMobile(value.replace(/\D/g, "").slice(0, 10));
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isLoading) return;

    if (!/^\d{10}$/.test(mobile)) {
      showMessage(
        "Please enter a valid 10-digit registered mobile number.",
        "error"
      );
      return;
    }

    if (!password.trim()) {
      showMessage(
        "Please enter your portal password.",
        "error"
      );
      return;
    }

    setIsLoading(true);

    try {
      const account = await loginLocalParent(
        mobile,
        password,
        rememberMe
      );

      if (!account) {
        showMessage(
          "Invalid mobile number or password.",
          "error"
        );
        return;
      }

      router.replace("/parent/dashboard");
    } catch {
      showMessage(
        "Unable to sign in locally. Please try again.",
        "error"
      );
    } finally {
      setIsLoading(false);
    }
  }

  function handleForgotPassword() {
    // TODO: Connect this message to the future password-reset flow.
    showMessage(
      "Password recovery will be connected to the registered mobile number.",
      "success"
    );
  }

  function handleBiometric() {
    showMessage(
      "Biometric login will be enabled after WebAuthn integration.",
      "success"
    );
  }

  function handleBack() {
    router.replace("/");
  }

  return (
    <main className="min-h-screen bg-helios-surface text-helios-text">
      {/* =====================================================
          TOP HEADER
          ===================================================== */}
      <header className="sticky top-0 z-50 border-b border-slate-100 bg-helios-surface/90 shadow-[0_1px_8px_rgba(13,33,55,0.04)] backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 w-full max-w-[1280px] items-center justify-between gap-4 px-4 py-3 md:min-h-[76px] md:px-8 lg:px-10">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              aria-label="Go back"
              onClick={handleBack}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-slate-900 transition hover:bg-white active:scale-95 md:h-11 md:w-11"
            >
              <MaterialIcon className="text-[24px]">
                arrow_back_ios_new
              </MaterialIcon>
            </button>

            <div className="min-w-0">
              <div className="truncate text-[10px] font-extrabold uppercase tracking-[0.11em] text-helios-secondary md:text-xs">
                Helios Futuristic School
              </div>

              <h1 className="truncate text-xl font-semibold leading-tight tracking-tight text-slate-900 md:text-2xl">
                Parent Registration
              </h1>
            </div>
          </div>

          <img
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuDHXpydAhFoPzDmS1IuBBs5IRVM5ezmz-J1wLuTeFbyY6_BTy_fH33hTkJIKrWME70pG7bMPqM-HCBLUK8ed5zv4Oe6F61iXNFPTYqqcEPPBbCE4aGJ80M3gKf4Dd7b_vBhJScyWqlGLRkDRZ1b8CT6GN9ojOT3k_XOtctmoJJSnhhPwc7Oac33laPo1rLFw_HQKDIdiQKFXoYYqwlwisIEOv4KiDVw-eG0IUCkt3C2dXZTcSPevL0raGJtdROJ3Tptmw"
            alt="Helios Sunburst Logo"
            className="h-9 w-auto shrink-0 object-contain md:h-11"
          />
        </div>
      </header>

      {/* =====================================================
          PAGE CONTENT
          ===================================================== */}
      <div className="mx-auto w-full max-w-[1280px] px-4 pb-10 pt-6 md:px-8 md:pb-14 md:pt-8 lg:px-10">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-start lg:gap-7">

          {/* =================================================
              WELCOME CARD
              ================================================= */}
          <section className="relative overflow-hidden rounded-2xl bg-helios-primary-container p-6 text-white shadow-md md:rounded-3xl md:p-8 lg:min-h-[430px] lg:flex lg:flex-col lg:justify-center lg:p-10">
            <div className="pointer-events-none absolute -bottom-10 -right-10 h-44 w-44 rounded-full bg-helios-orange/10" />

            <div className="pointer-events-none absolute -bottom-4 -right-7 opacity-10">
              <svg
                aria-hidden="true"
                width="170"
                height="170"
                viewBox="0 0 100 100"
                fill="none"
              >
                <circle
                  cx="50"
                  cy="50"
                  r="28"
                  fill="#FB7800"
                />
                <path
                  d="M50 0L55 25L50 20L45 25Z"
                  fill="#FB7800"
                />
                <path
                  d="M50 100L55 75L50 80L45 75Z"
                  fill="#FB7800"
                />
                <path
                  d="M0 50L25 55L20 50L25 45Z"
                  fill="#FB7800"
                />
                <path
                  d="M100 50L75 55L80 50L75 45Z"
                  fill="#FB7800"
                />
                <path
                  d="M15 15L35 30L30 35Z"
                  fill="#FB7800"
                />
                <path
                  d="M85 85L65 70L70 65Z"
                  fill="#FB7800"
                />
                <path
                  d="M15 85L30 65L35 70Z"
                  fill="#FB7800"
                />
                <path
                  d="M85 15L70 35L65 30Z"
                  fill="#FB7800"
                />
              </svg>
            </div>

            <div className="relative z-10">
              <div className="mb-4 flex items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-helios-orange text-white">
                  <MaterialIcon filled className="text-[22px]">
                    wb_sunny
                  </MaterialIcon>
                </span>

                <span className="text-[11px] font-extrabold uppercase tracking-[0.11em] text-orange-100 md:text-xs">
                  Helios Parent Connect
                </span>
              </div>

              <h2 className="text-[34px] font-extrabold leading-tight tracking-tight md:text-5xl">
                Welcome Back
              </h2>

              <p className="mt-3 max-w-xl text-[15px] leading-7 text-white/90 md:text-lg md:leading-8">
                Sign in to raise school support requests, track your tickets,
                and follow their progress from submission to resolution.
              </p>

              <div className="mt-7 flex items-start gap-2.5 text-orange-100">
                <MaterialIcon className="mt-0.5 text-[18px]">
                  verified_user
                </MaterialIcon>

                <span className="text-sm font-bold leading-6 md:text-base">
                  Centralized Parent Support &amp; Ticket Resolution
                </span>
              </div>
            </div>
          </section>

          {/* =================================================
              RIGHT SIDE
              ================================================= */}
          <div className="space-y-5">

            {/* ===============================================
                LOGIN FORM
                =============================================== */}
            <section className="rounded-2xl border border-slate-100/70 bg-white p-5 shadow-sm md:rounded-3xl md:p-8">
              <form onSubmit={handleLogin} noValidate>
                <div className="space-y-5">

                  {/* Mobile */}
                  <div>
                    <label
                      htmlFor="mobile-input"
                      className="mb-2 flex items-center justify-between gap-3 text-sm font-semibold text-slate-900"
                    >
                      <span>Registered Mobile Number</span>

                      <span className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-helios-secondary">
                        Primary Guardian
                      </span>
                    </label>

                    <div className="flex items-center rounded-xl bg-helios-surface-low p-1.5 transition focus-within:ring-2 focus-within:ring-orange-200">
                      <div className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 py-2.5 shadow-sm">
                        <span className="text-sm">🇮🇳</span>
                        <span className="text-sm font-extrabold">
                          +91
                        </span>
                      </div>

                      <input
                        id="mobile-input"
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel"
                        maxLength={10}
                        value={mobile}
                        onChange={(event) =>
                          handleMobileChange(event.target.value)
                        }
                        placeholder="Registered Mobile Number"
                        className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-base text-slate-900 outline-none placeholder:text-slate-400 md:text-lg"
                      />
                    </div>

                    <p className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-helios-muted md:text-sm">
                      <MaterialIcon className="text-[16px] text-helios-secondary">
                        info
                      </MaterialIcon>

                      <span>
                        Use the 10-digit number recorded on scholar&apos;s
                        admission file.
                      </span>
                    </p>
                  </div>

                  {/* Password */}
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <label
                        htmlFor="password-input"
                        className="text-sm font-semibold text-slate-900"
                      >
                        Portal Password
                      </label>

                      <button
                        type="button"
                        onClick={handleForgotPassword}
                        className="text-xs font-extrabold text-helios-secondary hover:underline md:text-sm"
                      >
                        Forgot Password?
                      </button>
                    </div>

                    <div className="flex items-center rounded-xl bg-helios-surface-low p-1.5 transition focus-within:ring-2 focus-within:ring-orange-200">
                      <MaterialIcon className="px-2 text-slate-500">
                        lock
                      </MaterialIcon>

                      <input
                        id="password-input"
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        value={password}
                        onChange={(event) =>
                          setPassword(event.target.value)
                        }
                        placeholder="Enter your account password"
                        className="min-w-0 flex-1 bg-transparent px-1 py-2.5 text-base text-slate-900 outline-none placeholder:text-slate-400 md:text-lg"
                      />

                      <button
                        type="button"
                        aria-label={
                          showPassword
                            ? "Hide password"
                            : "Show password"
                        }
                        onClick={() =>
                          setShowPassword((current) => !current)
                        }
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-white hover:text-slate-900"
                      >
                        <MaterialIcon className="text-[20px]">
                          {showPassword
                            ? "visibility_off"
                            : "visibility"}
                        </MaterialIcon>
                      </button>
                    </div>
                  </div>

                  <div className="pt-1">
                    <label className="flex cursor-pointer select-none items-center gap-2">
                      {/* TODO: Wire configurable session duration when the backend supports it. */}
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(event) =>
                          setRememberMe(event.target.checked)
                        }
                        className="h-4 w-4 accent-[#FB7800]"
                      />

                      <span className="text-sm font-medium text-slate-800">
                        Keep me signed in
                      </span>
                    </label>
                  </div>

                  {/* Login */}
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-helios-orange py-3.5 px-4 text-sm font-extrabold text-white shadow-md transition hover:brightness-95 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 md:text-base"
                  >
                    {isLoading ? (
                      <>
                        <MaterialIcon className="animate-spin text-[20px]">
                          sync
                        </MaterialIcon>

                        <span>Verifying Credentials...</span>
                      </>
                    ) : (
                      <>
                        <span>Sign In to Parent Portal</span>

                        <MaterialIcon className="text-[21px]">
                          arrow_forward
                        </MaterialIcon>
                      </>
                    )}
                  </button>

                  {/* Status */}
                  {message && (
                    <div
                      role="status"
                      aria-live="polite"
                      className={`rounded-xl px-4 py-3 text-center text-sm font-semibold ${
                        messageType === "error"
                          ? "bg-red-50 text-red-700"
                          : "bg-helios-surface-container text-slate-800"
                      }`}
                    >
                      {message}
                    </div>
                  )}
                </div>
              </form>
            </section>

            {/* ===============================================
                REGISTER
                =============================================== */}
            <section className="rounded-2xl border border-slate-100/70 bg-white p-5 text-center shadow-sm md:rounded-3xl md:p-7">
              <div className="flex items-center gap-3 text-slate-500">
                <span className="h-px flex-1 bg-slate-200" />

                <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.12em]">
                  New to Helios Futuristic School?
                </span>

                <span className="h-px flex-1 bg-slate-200" />
              </div>

              <h2 className="mt-5 text-xl font-extrabold tracking-tight text-slate-900 md:text-2xl">
                Register Scholar &amp; Guardian Account
              </h2>

              <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600 md:text-base">
                Create your parent account and link your student profile in 3 simple steps.
              </p>

              <Link
                href="/register"
                className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-helios-surface-container px-4 py-3 text-sm font-extrabold text-slate-900 transition hover:bg-helios-surface-high md:text-base"
              >
                <MaterialIcon className="text-helios-orange">
                  person_add
                </MaterialIcon>

                Register Scholar &amp; Parent Profile
              </Link>
            </section>

            {/* ===============================================
                HELPDESK
                =============================================== */}
            <section className="rounded-2xl border border-transparent bg-helios-surface-container-low p-5 shadow-sm md:rounded-3xl md:p-7">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-helios-surface-container-lowest text-helios-secondary">
                  <MaterialIcon className="text-[20px]">
                    support_agent
                  </MaterialIcon>
                </span>

                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-extrabold leading-6 text-slate-900 md:text-xl">
                    Campus Helpdesk &amp; Admission Support
                  </h2>

                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Having trouble logging in or need to update your
                    registered emergency contact details?
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 md:gap-3">
                <a
                  href="tel:9603109222"
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-white px-3 py-3 text-sm font-bold text-slate-800 shadow-sm transition hover:-translate-y-0.5"
                >
                  <MaterialIcon className="text-[17px] text-helios-secondary">
                    phone_in_talk
                  </MaterialIcon>

                  <span>9603109222</span>
                </a>

                <a
                  href="mailto:heliosupportconnect@gmail.com"
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-white px-3 py-3 text-sm font-bold text-slate-800 shadow-sm transition hover:-translate-y-0.5"
                >
                  <MaterialIcon className="text-[17px] text-helios-secondary">
                    mail
                  </MaterialIcon>

                  <span>heliosupportconnect@gmail.com</span>
                </a>
              </div>

              <div className="mt-4 flex items-center justify-center gap-1.5 text-xs text-slate-500 md:text-sm">
                <MaterialIcon className="text-[16px]">
                  location_on
                </MaterialIcon>

                <span>
                  Sadineni Chowdaraiah Campus • Guntur District, AP
                </span>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}