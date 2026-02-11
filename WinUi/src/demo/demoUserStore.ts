export type DemoUserProfile = {
  name: string;
  age: number;
  location: string;
  interests: string[];
  fitnessLevel: number; // 1..10
};

const LS_KEY = "flok.demoUserProfile.v1";

export async function loadDemoUserProfile(): Promise<DemoUserProfile> {
  // Prefer saved profile (demo edits)
  const cached = localStorage.getItem(LS_KEY);
  if (cached) {
    return JSON.parse(cached) as DemoUserProfile;
  }

  // Fall back to seeded JSON
  const res = await fetch("/demoUser.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load demoUser.json: ${res.status}`);
  const seeded = (await res.json()) as DemoUserProfile;

  // Cache it so future loads are instant
  localStorage.setItem(LS_KEY, JSON.stringify(seeded));
  return seeded;
}

export function saveDemoUserProfile(profile: DemoUserProfile) {
  localStorage.setItem(LS_KEY, JSON.stringify(profile));
  window.dispatchEvent(new Event("flok-demo-profile-updated"));
}

export function resetDemoUserProfile() {
  localStorage.removeItem(LS_KEY);
  window.dispatchEvent(new Event("flok-demo-profile-updated"));
}

export function exportDemoUserProfile(profile: DemoUserProfile) {
  const blob = new Blob([JSON.stringify(profile, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "demoUser.json";
  a.click();

  URL.revokeObjectURL(url);
}
