import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

export type Friend = {
  id?: string;
  name: string;
};

/**
 * TODO (backend): implement GET /api/friends to return Friend[]
 * Example response: [{"id":"1","name":"Alicia"},{"id":"2","name":"Ben"}]
 */
export async function getFriendsList(): Promise<Friend[]> {
  const res = await fetch("/api/friends", {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) throw new Error(`Failed to fetch friends: ${res.status}`);
  return (await res.json()) as Friend[];
}

function FriendCard({ friend }: { friend: Friend }) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-sm">
      <div className="text-sm text-[var(--color-muted)]">Friend</div>
      <div className="mt-1 text-base font-semibold text-[var(--color-ink)]">
        {friend.name}
      </div>
    </div>
  );
}

export default function FriendsPage() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await getFriendsList();
      setFriends(list);
    } catch (e) {
      setFriends([]);
      setError(e instanceof Error ? e.message : "Failed to load friends.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-ink)]">
            Friends
          </h1>
          <p className="mt-2 text-[var(--color-muted)]">
            Your friend list (API-backed). We’ll add more later.
          </p>
        </div>

        <button
          onClick={load}
          className="flok-button-primary inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold shadow-sm disabled:opacity-60"
          disabled={loading}
        >
          <RefreshCw className={"h-4 w-4 " + (loading ? "animate-spin" : "")} />
          Refresh
        </button>
      </div>

      <div className="rounded-3xl border border-[var(--color-border)] bg-white p-6 shadow-sm">
        {loading ? (
          <div className="text-[var(--color-muted)]">Loading friends…</div>
        ) : error ? (
          <div className="space-y-2">
            <div className="text-sm font-semibold text-[var(--color-danger)]">
              Couldn’t load friends
            </div>
            <div className="text-sm text-[var(--color-muted)]">
              {error}
              <div className="mt-2 text-[var(--color-muted)]">
                Expected endpoint: <span className="font-mono">GET /api/friends</span>
              </div>
            </div>
          </div>
        ) : friends.length === 0 ? (
          <div className="space-y-2">
            <div className="text-sm font-semibold text-[var(--color-ink)]">
              No friends yet
            </div>
            <div className="text-sm text-[var(--color-muted)]">
              When the API is ready, your friends will appear here as cards.
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {friends.map((f, idx) => (
              <FriendCard key={f.id ?? `${f.name}-${idx}`} friend={f} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
