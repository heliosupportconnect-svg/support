"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LocalAccountExistsError,
  registerLocalParent,
} from "@/lib/client-auth";

type Step = 1 | 2 | 3;

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

export default function RegisterPage() {
  const router = useRouter();

  const [step, setStep] = useState<Step>(1);

  const [parentName, setParentName] =
    useState("");
  const [relation, setRelation] = useState("");
  const [email, setEmail] = useState("");

  const [primaryPhone, setPrimaryPhone] =
    useState("");
  const [emergencyPhone, setEmergencyPhone] =
    useState("");

  const [studentName, setStudentName] =
    useState("");

  const [admissionId, setAdmissionId] =
    useState("");

  const [studentClass, setStudentClass] =
    useState("");

  const [rollNumber, setRollNumber] =
    useState("");

  const [section, setSection] =
    useState("");
  const [house, setHouse] = useState("");

  const [transportMode, setTransportMode] =
    useState<"self" | "bus" | "">("");

  const [busNumber, setBusNumber] =
    useState("");

  const [busRoute, setBusRoute] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [confirmPassword, setConfirmPassword] =
    useState("");

  const [showPassword, setShowPassword] =
    useState(false);

  const [showConfirmPassword, setShowConfirmPassword] =
    useState(false);

  const [termsAccepted, setTermsAccepted] =
    useState(false);

  const [success, setSuccess] =
    useState(false);

  const [isSubmitting, setIsSubmitting] =
    useState(false);

  const [error, setError] = useState("");

  function goBack() {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push("/login");
    }
  }

  function sanitizePhone(value: string) {
    return value.replace(/\D/g, "").slice(0, 10);
  }

  function goToStep(nextStep: Step) {
    setError("");
    setStep(nextStep);
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function validateStepOne() {
    if (!parentName.trim()) {
      setError("Please enter the guardian's full name.");
      return false;
    }

    if (!/^\d{10}$/.test(primaryPhone)) {
      setError(
        "Please enter a valid 10-digit primary mobile number."
      );
      return false;
    }

    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Please enter a valid email address.");
      return false;
    }

    if (!relation) {
      setError("Please select your relationship to the scholar.");
      return false;
    }

    if (
      emergencyPhone &&
      !/^\d{10}$/.test(emergencyPhone)
    ) {
      setError(
        "Please enter a valid 10-digit emergency contact number."
      );
      return false;
    }

    return true;
  }

  function validateStepTwo() {
    if (!studentName.trim()) {
      setError("Please enter the scholar's full name.");
      return false;
    }

    if (!studentClass) {
      setError("Please select the student's class.");
      return false;
    }

    if (!admissionId.trim()) {
      setError("Please enter the student's admission or student ID.");
      return false;
    }

    if (!rollNumber.trim()) {
      setError("Please enter the student's roll number.");
      return false;
    }

    if (!house.trim()) {
      setError("Please enter the student's house address.");
      return false;
    }

    if (!transportMode) {
      setError("Please select a mode of transport.");
      return false;
    }

    if (transportMode === "bus") {
      if (!busNumber.trim()) {
        setError("Please enter the school bus number.");
        return false;
      }

      if (!busRoute.trim()) {
        setError("Please enter the school bus route.");
        return false;
      }
    }

    return true;

  }

  function handleContinueFromStepOne() {
    if (!validateStepOne()) return;
    goToStep(2);
  }

  function handleContinueFromStepTwo() {
    if (!validateStepTwo()) return;
    goToStep(3);
  }

  async function completeRegistration(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setError("");

    if (password.length < 8) {
      setError(
        "Password must contain at least 8 characters."
      );
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (!termsAccepted) {
      setError(
        "Please accept the portal terms and conditions."
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const account = await registerLocalParent(
        {
          name: parentName.trim(),
          email: email.trim(),
          phone: primaryPhone,
          emergencyPhone: emergencyPhone.trim(),
          relationship: relation,
          student: {
            admissionNumber: admissionId.trim(),
            name: studentName.trim(),
            className: studentClass,
            section,
            rollNumber: rollNumber.trim(),
            house: house.trim(),
            relationship: relation,
            modeOfTransport: transportMode === "bus" ? "School Bus" : "Self Transport",
            busNumber: transportMode === "bus" ? busNumber.trim() : "",
            busRoute: transportMode === "bus" ? busRoute.trim() : "",
          },
          password,
        }
      );

      if (!account) {
        setError("Unable to create the Neon account. Please try again.");
        return;
      }

      setSuccess(true);
      router.push("/parent/dashboard");
    } catch (registrationError) {
      if (registrationError instanceof LocalAccountExistsError) {
        setError(
          "An account with this mobile number already exists."
        );
        return;
      }

      setError(registrationError instanceof Error ? registrationError.message : "Unable to create the local account. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-helios-surface text-helios-text">

      {/* =====================================================
          HEADER
          ===================================================== */}
      <header className="sticky top-0 z-50 border-b border-slate-100 bg-helios-surface/90 shadow-[0_1px_8px_rgba(0,0,0,0.04)] backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 w-full max-w-[900px] items-center justify-between gap-4 px-4 py-3 md:min-h-[76px] md:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              aria-label="Go back"
              onClick={goBack}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-slate-900 transition hover:bg-white active:scale-95"
            >
              <MaterialIcon className="text-[23px]">
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
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuCLl5o1EiM2e8vCCPPHoS0kszpSI7-1SQHftJ1XbZx8bANdnsDJQRJsDStftZJ7TSjE7SlP2-ItPRbcvj3OnTjsW-G39uRRzT21WLB_rMCVr5NuxOPvGp1q87vAoz98TXaxaQAW7qoeuPwJLeHFeetBMV2e0siPBpo3VFQzJyp7X9XHjN2H8JdkuhVt8H22_OvElvFj0mwIOJE9U_ZLoujv3TuJSsZakr_eHbuGzUTWJCddfQ1UE9njm0dopfxdMcF6fQ"
            alt="Helios Sunburst Logo"
            className="h-9 w-auto shrink-0 object-contain md:h-11"
          />
        </div>
      </header>

      <div className="mx-auto w-full max-w-[900px] px-4 pb-10 md:px-8">

        {/* ===================================================
            TOP INTRO CARD
            =================================================== */}
        <section className="mt-4 flex items-center gap-4 rounded-2xl bg-helios-surface-low p-4 shadow-sm md:mt-6 md:p-5">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-helios-orange/15 text-helios-secondary">
            <MaterialIcon filled className="text-[27px]">
              solar_power
            </MaterialIcon>
          </div>

          <div className="min-w-0">
            <div className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-helios-secondary">
              Helios Parent Portal
            </div>

            <h2 className="truncate text-lg font-semibold text-slate-900">
              Parent &amp; Student Account Setup
            </h2>

            <p className="truncate text-xs text-helios-muted md:text-sm">
              Create your parent account and link your student profile
            </p>
          </div>
        </section>

        {/* ===================================================
            PROGRESS
            =================================================== */}
        <section className="mt-4 rounded-2xl bg-white p-4 shadow-sm md:mt-5 md:p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-slate-800 md:text-xs">
              Registration Progress
            </span>

            <span className="text-[11px] font-extrabold text-helios-secondary md:text-xs">
              Step {step} of 3
            </span>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-1">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className={`h-2 rounded-full transition-colors ${
                  step >= item
                    ? "bg-helios-orange"
                    : "bg-helios-surface-high"
                }`}
              />
            ))}
          </div>

          <div className="mt-2 flex justify-between gap-2 text-[11px] font-bold md:text-xs">
            <span
              className={
                step >= 1
                  ? "text-helios-secondary"
                  : "text-helios-muted"
              }
            >
              1. Parent Info
            </span>

            <span
              className={
                step >= 2
                  ? "text-slate-800"
                  : "text-helios-muted"
              }
            >
              2. Student Info
            </span>

            <span
              className={
                step >= 3
                  ? "text-helios-secondary"
                  : "text-helios-muted"
              }
            >
              3. Set Password
            </span>
          </div>
        </section>

        {/* ===================================================
            ERROR MESSAGE
            =================================================== */}
        {error && (
          <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}

        {/* ===================================================
            REGISTRATION FORM
            =================================================== */}
        {!success ? (
          <form
            onSubmit={completeRegistration}
            autoComplete="off"
            className="mt-4"
          >

            {/* =================================================
                STEP 1
                ================================================= */}
            {step === 1 && (
              <section className="space-y-4">

                <div className="rounded-2xl bg-white p-4 shadow-sm md:p-6">
                  <div className="flex items-center gap-2">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-helios-primary-container text-xs font-bold text-white">
                      1
                    </span>

                    <h3 className="text-base font-bold">
                      Parent / Guardian Info
                    </h3>
                  </div>

                  <div className="mt-5 space-y-4">

                    {/* Guardian Name */}
                    <div>
                      <label className="mb-1.5 block text-xs font-bold md:text-sm">
                        Guardian Full Name
                      </label>

                      <div className="flex items-center rounded-xl bg-helios-surface-low px-3 py-3">
                        <MaterialIcon className="mr-2 text-[20px] text-slate-500">
                          person
                        </MaterialIcon>

                        <input
                          value={parentName}
                          onChange={(e) =>
                            setParentName(e.target.value)
                          }
                          type="text"
                          placeholder="Full Name"
                          className="min-w-0 flex-1 bg-transparent text-sm outline-none md:text-base"
                        />
                      </div>
                    </div>

                    {/* Relationship */}
                    <div>
                      <label className="mb-1.5 block text-xs font-bold md:text-sm">
                        Relationship to Scholar
                      </label>

                      <div className="grid grid-cols-3 gap-2">
                        {["Father", "Mother", "Guardian"].map(
                          (item) => (
                            <button
                              key={item}
                              type="button"
                              onClick={() =>
                                setRelation(item)
                              }
                              className={`rounded-xl px-2 py-3 text-xs font-bold transition md:text-sm ${
                                relation === item
                                  ? "bg-helios-secondary text-white shadow-sm"
                                  : "bg-helios-surface-container text-slate-800"
                              }`}
                            >
                              {item}
                            </button>
                          )
                        )}
                      </div>
                    </div>

                    {/* Email */}
                    <div>
                      <label className="mb-1.5 block text-xs font-bold md:text-sm">
                        Email Address
                      </label>

                      <div className="flex items-center rounded-xl bg-helios-surface-low px-3 py-3">
                        <MaterialIcon className="mr-2 text-[20px] text-slate-500">
                          mail
                        </MaterialIcon>

                        <input
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          type="email"
                          autoComplete="off"
                          placeholder="Email Address"
                          className="min-w-0 flex-1 bg-transparent text-sm outline-none md:text-base"
                        />
                      </div>
                    </div>

                    {/* Primary phone */}
                    <div>
                      <label className="mb-1.5 block text-xs font-bold md:text-sm">
                        Primary Mobile Number
                      </label>

                      <div className="flex items-center rounded-xl bg-helios-surface-low px-3 py-3">
                        <span className="shrink-0 text-xs font-bold text-helios-secondary">
                          +91
                        </span>

                        <span className="mx-3 h-5 w-px bg-helios-outline-variant" />

                        <input
                          value={primaryPhone}
                          onChange={(e) =>
                            setPrimaryPhone(
                              sanitizePhone(
                                e.target.value
                              )
                            )
                          }
                          inputMode="numeric"
                          maxLength={10}
                          type="tel"
                          autoComplete="off"
                          placeholder="Registered Mobile Number"
                          className="min-w-0 flex-1 bg-transparent text-sm tracking-wider outline-none md:text-base"
                        />

                        <MaterialIcon className="text-[20px] text-helios-secondary">
                          phone_iphone
                        </MaterialIcon>
                      </div>

                      <p className="mt-1.5 text-xs text-helios-muted">
                        This mobile number serves as your
                        primary Helios account identifier.
                      </p>
                    </div>

                    {/* Emergency */}
                    <div>
                      <label className="mb-1.5 block text-xs font-bold md:text-sm">
                        Alternate Emergency Contact
                      </label>

                      <div className="flex items-center rounded-xl bg-helios-surface-low px-3 py-3">
                        <span className="shrink-0 text-xs font-bold text-slate-500">
                          +91
                        </span>

                        <span className="mx-3 h-5 w-px bg-helios-outline-variant" />

                        <input
                          value={emergencyPhone}
                          onChange={(e) =>
                            setEmergencyPhone(
                              sanitizePhone(
                                e.target.value
                              )
                            )
                          }
                          inputMode="numeric"
                          maxLength={10}
                          type="tel"
                          autoComplete="off"
                          placeholder="Emergency Contact Number"
                          className="min-w-0 flex-1 bg-transparent text-sm tracking-wider outline-none md:text-base"
                        />

                        <MaterialIcon className="text-[20px] text-slate-500">
                          call
                        </MaterialIcon>
                      </div>

                      <p className="mt-1.5 text-xs text-helios-muted">
                        Used for urgent transit alerts &amp;
                        campus emergency notifications.
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleContinueFromStepOne}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-helios-secondary px-4 py-3.5 text-sm font-bold text-white shadow-md transition hover:brightness-105"
                >
                  Proceed to Student Info
                  <MaterialIcon className="text-[18px]">
                    arrow_forward
                  </MaterialIcon>
                </button>
              </section>
            )}

            {/* =================================================
                STEP 2
                ================================================= */}
            {step === 2 && (
              <section className="space-y-4">

                <div className="rounded-2xl bg-white p-4 shadow-sm md:p-6">

                  <div className="flex items-center gap-2">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-helios-primary-container text-xs font-bold text-white">
                      2
                    </span>

                    <h3 className="text-base font-bold">
                      Student Info
                    </h3>
                  </div>

                  <div className="mt-5 space-y-4">

                    {/* Scholar */}
                    <div>
                      <label className="mb-1.5 block text-xs font-bold md:text-sm">
                        Scholar Full Name
                      </label>

                      <div className="flex items-center rounded-xl bg-helios-surface-low px-3 py-3">
                        <MaterialIcon className="mr-2 text-[20px] text-slate-500">
                          school
                        </MaterialIcon>

                        <input
                          value={studentName}
                          onChange={(e) =>
                            setStudentName(e.target.value)
                          }
                          autoComplete="off"
                          className="min-w-0 flex-1 bg-transparent text-sm outline-none md:text-base"
                          placeholder="Student Name"
                        />
                      </div>
                    </div>

                    {/* Admission ID */}
                    <div className="rounded-2xl bg-helios-surface-low p-4">
                      <label className="mb-2 block text-xs font-bold md:text-sm">
                        Admission / Student ID
                      </label>

                      <div className="flex items-center rounded-xl bg-white px-3 py-3 shadow-sm">
                        <input
                          value={admissionId}
                          onChange={(e) =>
                            setAdmissionId(e.target.value)
                          }
                          autoComplete="off"
                          placeholder="Admission Number"
                          className="min-w-0 flex-1 bg-transparent text-sm outline-none md:text-base"
                        />

                        <MaterialIcon className="text-[22px] text-helios-secondary">
                          badge
                        </MaterialIcon>
                      </div>

                      <p className="mt-2 text-xs text-helios-muted">
                        Enter admission or roll/student
                        number as issued
                      </p>
                    </div>

                    {/* Class + Roll */}
                    <div className="grid grid-cols-[minmax(0,2fr)_minmax(110px,1fr)] gap-3">
                      <div>
                        <label className="mb-1.5 block text-xs font-bold md:text-sm">
                          Class
                        </label>

                        <div className="rounded-xl bg-helios-surface-low px-3 py-3">
                          <select
                            value={studentClass}
                            onChange={(e) =>
                              setStudentClass(
                                e.target.value
                              )
                            }
                            className="w-full bg-transparent text-sm outline-none md:text-base"
                          >
                            <option value="">Class</option>
                            {[
                              "LKG",
                              "UKG",
                              "Class 1",
                              "Class 2",
                              "Class 3",
                              "Class 4",
                              "Class 5",
                              "Class 6",
                              "Class 7",
                              "Class 8",
                              "Class 9",
                              "Class 10",
                            ].map((item) => (
                              <option
                                key={item}
                                value={item}
                              >
                                {item}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="mb-1.5 block text-xs font-bold md:text-sm">
                          Roll No.
                        </label>

                        <div className="flex items-center rounded-xl bg-helios-surface-low px-3 py-3">
                          <span className="mr-1 text-sm font-bold text-slate-500">
                            #
                          </span>

                          <input
                            value={rollNumber}
                            onChange={(e) =>
                              setRollNumber(
                                e.target.value
                              )
                            }
                            autoComplete="off"
                            className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none md:text-base"
                            placeholder="Roll Number"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Section */}
                    <div>
                      <label className="mb-1.5 block text-xs font-bold md:text-sm">
                        Section
                      </label>

                      <div className="grid grid-cols-2 gap-2">
                        {["Section A", "Section B"].map(
                          (item) => (
                            <button
                              key={item}
                              type="button"
                              onClick={() =>
                                setSection(item)
                              }
                              className={`rounded-xl py-3 text-xs font-bold transition md:text-sm ${
                                section === item
                                  ? "bg-helios-secondary text-white shadow-sm"
                                  : "bg-helios-surface-container text-slate-800"
                              }`}
                            >
                              {item}
                            </button>
                          )
                        )}
                      </div>
                    </div>

                    {/* House Address */}
                    <div>
                      <label className="mb-1.5 block text-xs font-bold md:text-sm">
                        House Address
                      </label>

                      <div className="flex items-center rounded-xl bg-helios-surface-low px-3 py-3">
                        <MaterialIcon className="mr-2 text-[20px] text-slate-500">
                          home
                        </MaterialIcon>

                        <input
                          value={house}
                          onChange={(e) => setHouse(e.target.value)}
                          autoComplete="off"
                          placeholder="House Address"
                          className="min-w-0 flex-1 bg-transparent text-sm outline-none md:text-base"
                        />
                      </div>
                    </div>

                    <div className="border-t border-slate-200 pt-4">

                      {/* Transport */}
                      <div>
                        <label className="mb-1.5 block text-xs font-bold md:text-sm">
                          Mode of Transport
                        </label>

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setTransportMode("self");
                              setBusNumber("");
                              setBusRoute("");
                            }}
                            className={`flex items-center justify-center gap-2 rounded-xl py-3 text-xs font-bold transition md:text-sm ${
                              transportMode === "self"
                                ? "bg-helios-secondary text-white shadow-sm"
                                : "bg-helios-surface-container text-slate-800"
                            }`}
                          >
                            <MaterialIcon className="text-[18px]">
                              directions_walk
                            </MaterialIcon>

                            Self Transport
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setTransportMode("bus")
                            }
                            className={`flex items-center justify-center gap-2 rounded-xl py-3 text-xs font-bold transition md:text-sm ${
                              transportMode === "bus"
                                ? "bg-helios-secondary text-white shadow-sm"
                                : "bg-helios-surface-container text-slate-800"
                            }`}
                          >
                            <MaterialIcon className="text-[18px]">
                              directions_bus
                            </MaterialIcon>

                            School Bus
                          </button>
                        </div>
                      </div>

                      {transportMode === "bus" && (
                        <div className="mt-4 space-y-4">
                          <div>
                            <label className="mb-1.5 block text-xs font-bold md:text-sm">
                              School Bus Number
                            </label>

                            <div className="flex items-center rounded-xl bg-helios-surface-low px-3 py-3">
                              <MaterialIcon className="mr-2 shrink-0 text-[20px] text-helios-secondary">
                                commute
                              </MaterialIcon>

                              <input
                                value={busNumber}
                                onChange={(e) => setBusNumber(e.target.value)}
                                autoComplete="off"
                                placeholder="Enter Bus Number"
                                className="min-w-0 flex-1 bg-transparent text-sm outline-none md:text-base"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="mb-1.5 block text-xs font-bold md:text-sm">
                              School Bus Route
                            </label>

                            <div className="flex items-center rounded-xl bg-helios-surface-low px-3 py-3">
                              <MaterialIcon className="mr-2 shrink-0 text-[20px] text-helios-secondary">
                                route
                              </MaterialIcon>

                              <input
                                value={busRoute}
                                onChange={(e) => setBusRoute(e.target.value)}
                                autoComplete="off"
                                placeholder="Enter Bus Route"
                                className="min-w-0 flex-1 bg-transparent text-sm outline-none md:text-base"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => goToStep(1)}
                    className="w-1/3 rounded-xl bg-helios-surface-container px-3 py-3.5 text-sm font-bold text-slate-800 transition active:scale-[0.99]"
                  >
                    Back
                  </button>

                  <button
                    type="button"
                    onClick={handleContinueFromStepTwo}
                    className="flex w-2/3 items-center justify-center gap-2 rounded-xl bg-helios-secondary px-3 py-3.5 text-sm font-bold text-white shadow-md transition hover:brightness-105"
                  >
                    Proceed to Set Password

                    <MaterialIcon className="text-[18px]">
                      arrow_forward
                    </MaterialIcon>
                  </button>
                </div>
              </section>
            )}

            {/* =================================================
                STEP 3
                ================================================= */}
            {step === 3 && (
              <section className="space-y-4">

                <div className="rounded-2xl bg-white p-4 shadow-sm md:p-6">

                  <div className="flex items-center gap-2">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-helios-primary-container text-xs font-bold text-white">
                      3
                    </span>

                    <h3 className="text-base font-bold">
                      Set Password
                    </h3>
                  </div>

                  <p className="mt-3 text-sm leading-6 text-helios-muted">
                    Create a secure password to access your
                    Helios Parent Portal account alongside
                    your mobile number login ID.
                  </p>

                  {/* Password */}
                  <div className="mt-5">
                    <label className="mb-1.5 block text-xs font-bold md:text-sm">
                      Create Password
                    </label>

                    <div className="flex items-center rounded-xl bg-helios-surface-low px-3 py-3">
                      <MaterialIcon className="mr-2 text-[20px] text-slate-500">
                        lock
                      </MaterialIcon>

                      <input
                        type={
                          showPassword
                            ? "text"
                            : "password"
                        }
                        value={password}
                        onChange={(e) =>
                          setPassword(e.target.value)
                        }
                        autoComplete="new-password"
                        placeholder="Minimum 8 characters"
                        className="min-w-0 flex-1 bg-transparent text-sm outline-none md:text-base"
                      />

                      <button
                        type="button"
                        aria-label="Toggle password visibility"
                        onClick={() =>
                          setShowPassword(
                            (current) => !current
                          )
                        }
                        className="ml-2"
                      >
                        <MaterialIcon className="text-[20px] text-slate-500">
                          {showPassword
                            ? "visibility_off"
                            : "visibility"}
                        </MaterialIcon>
                      </button>
                    </div>
                  </div>

                  {/* Confirm */}
                  <div className="mt-4">
                    <label className="mb-1.5 block text-xs font-bold md:text-sm">
                      Confirm Password
                    </label>

                    <div className="flex items-center rounded-xl bg-helios-surface-low px-3 py-3">
                      <MaterialIcon className="mr-2 text-[20px] text-slate-500">
                        lock_reset
                      </MaterialIcon>

                      <input
                        type={
                          showConfirmPassword
                            ? "text"
                            : "password"
                        }
                        value={confirmPassword}
                        onChange={(e) =>
                          setConfirmPassword(
                            e.target.value
                          )
                        }
                        autoComplete="new-password"
                        placeholder="Re-enter password"
                        className="min-w-0 flex-1 bg-transparent text-sm outline-none md:text-base"
                      />

                      <button
                        type="button"
                        aria-label="Toggle confirm password visibility"
                        onClick={() =>
                          setShowConfirmPassword(
                            (current) => !current
                          )
                        }
                        className="ml-2"
                      >
                        <MaterialIcon className="text-[20px] text-slate-500">
                          {showConfirmPassword
                            ? "visibility_off"
                            : "visibility"}
                        </MaterialIcon>
                      </button>
                    </div>
                  </div>

                  {/* Security criteria */}
                  <div className="mt-5 rounded-2xl bg-helios-surface-low p-4">
                    <div className="text-[11px] font-extrabold uppercase tracking-[0.11em] text-helios-secondary">
                      Security Criteria
                    </div>

                    <div className="mt-2 space-y-2 text-sm text-slate-800">
                      <div className="flex items-center gap-2">
                        <MaterialIcon className="text-[16px] text-helios-secondary">
                          check_circle
                        </MaterialIcon>

                        Minimum 8 characters in length
                      </div>

                      <div className="flex items-center gap-2">
                        <MaterialIcon className="text-[16px] text-helios-secondary">
                          check_circle
                        </MaterialIcon>

                        Includes letters and numbers or
                        symbols
                      </div>
                    </div>
                  </div>

                  {/* Terms */}
                  <label className="mt-5 flex cursor-pointer items-start gap-2 text-sm text-slate-800">
                    <input
                      type="checkbox"
                      checked={termsAccepted}
                      onChange={(e) =>
                        setTermsAccepted(
                          e.target.checked
                        )
                      }
                      className="mt-0.5 h-5 w-5 accent-[#FB7800]"
                    />

                    <span>
                      I agree to Helios Futuristic School
                      portal terms &amp; conditions.
                    </span>
                  </label>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => goToStep(2)}
                    className="w-1/3 rounded-xl bg-helios-surface-container px-3 py-3.5 text-sm font-bold text-slate-800"
                  >
                    Back
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex w-2/3 items-center justify-center gap-2 rounded-xl bg-helios-secondary px-3 py-3.5 text-sm font-bold text-white shadow-md transition hover:brightness-105 disabled:opacity-70"
                  >
                    {isSubmitting ? (
                      <>
                        <MaterialIcon className="animate-spin text-[20px]">
                          sync
                        </MaterialIcon>

                        Creating Account...
                      </>
                    ) : (
                      <>
                        <MaterialIcon className="text-[20px]">
                          person_add
                        </MaterialIcon>

                        Create Account &amp; Register
                      </>
                    )}
                  </button>
                </div>
              </section>
            )}
          </form>
        ) : (
          /* =================================================
             SUCCESS CARD
             ================================================= */
          <section className="mt-4 rounded-2xl bg-white p-6 text-center shadow-xl md:p-8">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-helios-orange/15 text-helios-secondary ring-4 ring-orange-100">
              <MaterialIcon
                filled
                className="text-[40px]"
              >
                check_circle
              </MaterialIcon>
            </div>

            <div className="mt-4">
              <div className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-helios-secondary">
                Success Badge
              </div>

              <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">
                Account Created Successfully!
              </h2>

              <p className="mt-2 text-sm leading-6 text-helios-muted">
                Welcome to Helios Parent Portal! Your
                account linked with Scholar record has been
                created successfully.
              </p>
            </div>

            <div className="mt-5 rounded-2xl bg-helios-surface-low p-4 text-left">
              <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-3 text-sm">
                <span className="text-helios-muted">
                  Primary Login ID:
                </span>

                <span className="font-bold text-helios-secondary">
                  +91 {primaryPhone}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4 border-b border-slate-200 py-3 text-sm">
                <span className="text-helios-muted">
                  Linked Scholar:
                </span>

                <span className="font-bold text-slate-900">
                  {studentName}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4 pt-3 text-sm">
                <span className="text-helios-muted">
                  Admission / Student ID:
                </span>

                <span className="font-bold text-slate-900">
                  {admissionId || "Pending verification"}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => router.push("/login")}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-helios-secondary px-4 py-3.5 text-sm font-bold text-white shadow-md transition hover:brightness-105"
            >
              <MaterialIcon className="text-[20px]">
                login
              </MaterialIcon>

              Go to Login
            </button>
          </section>
        )}

        {/* ===================================================
            HELP STRIP
            =================================================== */}
        <div className="mt-5 flex items-center justify-between gap-3 rounded-full bg-helios-surface-container px-4 py-2 shadow-sm">
          <div className="flex min-w-0 items-center gap-2">
            <MaterialIcon className="shrink-0 text-[20px] text-helios-secondary">
              support_agent
            </MaterialIcon>

            <span className="truncate text-xs font-semibold text-slate-800 md:text-sm">
              Need admission lookup help?
            </span>
          </div>

          <a
            href="tel:9603109222"
            className="shrink-0 rounded-full bg-helios-orange px-3 py-1.5 text-[10px] font-extrabold text-white transition active:scale-95 md:text-xs"
          >
            Call Reception 9603109222
          </a>
        </div>
      </div>
    </main>
  );
}