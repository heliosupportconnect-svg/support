"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  clearLocalAdminSession,
  getAdminSession,
  getAdminRoleLabel,
  getLocalAdminAccount,
  updateLocalAdminAccount,
  updateLocalAdminPassword,
} from "@/lib/client-admin-auth";

function AdminProfileLoadingState() {
  return (
    <main className="min-h-screen bg-helios-surface text-helios-text">
      <div className="mx-auto flex min-h-screen max-w-[1440px] items-center justify-center px-4">
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-8 text-center shadow-sm">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-helios-primary text-white">
            <span className="material-symbols-outlined">account_circle</span>
          </div>
          <p className="mt-4 text-lg font-extrabold text-helios-primary">Loading admin profile...</p>
        </div>
      </div>
    </main>
  );
}

export default function AdminProfilePage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [adminId, setAdminId] = useState("");
  const [role, setRole] = useState("");
  const [sessionCreatedAt, setSessionCreatedAt] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: "", username: "", email: "", mobile: "" });
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");

  useEffect(() => {
    const mountTimer = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(mountTimer);
  }, []);

  useEffect(() => {
    if (!mounted) {
      return;
    }

    const syncAdminState = async () => {
      const current = await getAdminSession();
      if (!current) {
        setAdminId("");
        setRole("");
        router.replace("/");
        return;
      }

      setAdminId(current.session.adminId);
      setRole(current.account.role);
      setSessionCreatedAt(current.session.createdAt);
    };

    void syncAdminState();

    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === "helios_admin_session" || event.key === "helios_admin_accounts") {
        void syncAdminState();
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [mounted, router]);

  const session = adminId && role ? { adminId, role, createdAt: sessionCreatedAt } : null;
  const account = mounted && adminId ? getLocalAdminAccount() : null;

  useEffect(() => {
    if (!account) {
      return;
    }

    const profileTimer = window.setTimeout(() => setProfileForm({
      name: account.name,
      username: account.username,
      email: account.email,
      mobile: account.mobile,
    }), 0);
    return () => window.clearTimeout(profileTimer);
  }, [account?.id, account?.name, account?.username, account?.email, account?.mobile]);

  if (!mounted) {
    return <AdminProfileLoadingState />;
  }

  if (!account || !session) {
    return <AdminProfileLoadingState />;
  }

  const activeAdmin = account;

  function logout() {
    clearLocalAdminSession();
    router.replace("/");
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileError("");
    setProfileMessage("");

    try {
      const updated = await updateLocalAdminAccount(activeAdmin.id, {
        name: profileForm.name,
        username: profileForm.username,
        email: profileForm.email,
        mobile: profileForm.mobile,
      });

      setProfileForm({
        name: updated.name,
        username: updated.username,
        email: updated.email,
        mobile: updated.mobile,
      });
      setIsEditing(false);
      setProfileMessage("Profile updated successfully.");
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Unable to save profile.");
    }
  }

  async function savePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError("");
    setPasswordMessage("");

    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      setPasswordError("Please complete all password fields.");
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError("New password and confirmation do not match.");
      return;
    }

    try {
      await updateLocalAdminPassword(activeAdmin.id, passwordForm.currentPassword, passwordForm.newPassword);
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setPasswordMessage("Password updated successfully.");
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : "Unable to update password.");
    }
  }

  return (
    <main className="min-h-screen bg-helios-surface text-helios-text">
      <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/95 shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-[1440px] items-center justify-between gap-4 px-4 md:px-8">
          <button
            type="button"
            onClick={() => router.push("/admin/dashboard")}
            className="flex items-center gap-2 rounded-lg bg-helios-surface-container px-3 py-2 text-sm font-bold text-helios-primary"
          >
            <span className="material-symbols-outlined text-base">arrow_back</span>
            Back to dashboard
          </button>

          <button
            type="button"
            onClick={logout}
            className="rounded-lg px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50"
          >
            Logout
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-[900px] px-4 py-8 md:px-8">
        <section className="rounded-[28px] border border-slate-100 bg-white p-6 shadow-sm md:p-8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-helios-secondary">
                Admin Profile
              </p>
              <h1 className="mt-2 text-2xl font-extrabold text-helios-primary">{account.name}</h1>
            </div>
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-helios-primary text-xl font-extrabold text-white">
              {account.name
                .split(" ")
                .slice(0, 2)
                .map((part) => part[0]?.toUpperCase() ?? "")
                .join("") || "A"}
            </div>
          </div>

          {profileMessage && (
            <div className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{profileMessage}</div>
          )}
          {profileError && (
            <div className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{profileError}</div>
          )}

          {!isEditing ? (
            <>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <Info label="Name" value={account.name} />
                <Info label="Username" value={account.username} />
                <Info label="Role" value={getAdminRoleLabel(account.role)} />
                <Info label="Email" value={account.email} />
                <Info label="Mobile Number" value={account.mobile} />
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <button type="button" onClick={() => setIsEditing(true)} className="rounded-xl bg-helios-primary px-4 py-2.5 text-sm font-bold text-white">Edit Profile</button>
              </div>

              <div className="mt-6 rounded-2xl bg-helios-surface-low p-4 text-xs text-helios-muted">
                Session created: {new Date(session.createdAt).toLocaleString("en-IN")}
              </div>
            </>
          ) : (
            <form onSubmit={saveProfile} className="mt-6 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Name" value={profileForm.name} onChange={(value) => setProfileForm((current) => ({ ...current, name: value }))} />
                <Field label="Username" value={profileForm.username} onChange={(value) => setProfileForm((current) => ({ ...current, username: value }))} />
                <Field label="Email" type="email" value={profileForm.email} onChange={(value) => setProfileForm((current) => ({ ...current, email: value }))} />
                <Field label="Mobile Number" value={profileForm.mobile} onChange={(value) => setProfileForm((current) => ({ ...current, mobile: value }))} />
              </div>

              <div className="flex flex-wrap gap-3">
                <button type="submit" className="rounded-xl bg-helios-primary px-4 py-2.5 text-sm font-bold text-white">Save Changes</button>
                <button type="button" onClick={() => setIsEditing(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-helios-primary">Cancel</button>
              </div>
            </form>
          )}
        </section>

        <section className="mt-6 rounded-[28px] border border-slate-100 bg-white p-6 shadow-sm md:p-8">
          <h2 className="text-xl font-extrabold text-helios-primary">Change Password</h2>
          {passwordMessage && (
            <div className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{passwordMessage}</div>
          )}
          {passwordError && (
            <div className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{passwordError}</div>
          )}

          <form onSubmit={savePassword} className="mt-5 space-y-4">
            <Field label="Current Password" type="password" value={passwordForm.currentPassword} onChange={(value) => setPasswordForm((current) => ({ ...current, currentPassword: value }))} />
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="New Password" type="password" value={passwordForm.newPassword} onChange={(value) => setPasswordForm((current) => ({ ...current, newPassword: value }))} />
              <Field label="Confirm New Password" type="password" value={passwordForm.confirmPassword} onChange={(value) => setPasswordForm((current) => ({ ...current, confirmPassword: value }))} />
            </div>
            <button type="submit" className="rounded-xl bg-helios-orange px-4 py-2.5 text-sm font-bold text-white">Update Password</button>
          </form>
        </section>
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-helios-surface-low p-4">
      <div className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-helios-muted">{label}</div>
      <div className="mt-2 text-sm font-bold text-helios-primary">{value}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block text-sm font-semibold text-slate-900">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-xl border border-slate-200 bg-helios-surface-low px-3 py-3 text-sm font-normal outline-none focus:ring-2 focus:ring-orange-200"
      />
    </label>
  );
}
