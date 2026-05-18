import { useCallback, useMemo, useState } from "react";
import { Activity, Bell, CheckCircle2, Database, FilePlus2, PanelRightOpen } from "lucide-react";
import { alt } from "@alt/plugin-sdk";
import type { PluginActiveNoteSummary, PluginStorageValue } from "@alt/plugin-sdk";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type LogEntry = {
  id: string;
  label: string;
  detail: string;
};

function hasAltRuntime() {
  return typeof window !== "undefined" && "alt" in window;
}

function formatValue(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export default function App() {
  const [activeNote, setActiveNote] = useState<PluginActiveNoteSummary | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [subscribed, setSubscribed] = useState(false);
  const isAlt = useMemo(() => hasAltRuntime(), []);

  const pushLog = useCallback((label: string, detail: unknown) => {
    setLogs((current) => [
      {
        id: crypto.randomUUID(),
        label,
        detail: typeof detail === "string" ? detail : formatValue(detail),
      },
      ...current.slice(0, 5),
    ]);
  }, []);

  const run = useCallback(
    async (label: string, action: () => Promise<void>) => {
      if (!isAlt) {
        pushLog(label, "Run this bundle inside Alt to access window.alt.");
        return;
      }

      try {
        await action();
      } catch (error) {
        pushLog(`${label} failed`, error instanceof Error ? error.message : String(error));
      }
    },
    [isAlt, pushLog],
  );

  const readState = useCallback(() => {
    void run("Read active note", async () => {
      const note = await alt.state.getActiveNoteSummary();
      setActiveNote(note);
      pushLog("Active note", note ?? "No active note selected");
    });
  }, [pushLog, run]);

  const writeStorage = useCallback(() => {
    void run("Storage round trip", async () => {
      const value: PluginStorageValue = {
        checkedAt: new Date().toISOString(),
        source: "alt-react-plugin-template",
      };
      await alt.storage.set("template:last-check", value);
      const stored = await alt.storage.get("template:last-check");
      pushLog("Stored value", stored);
    });
  }, [pushLog, run]);

  const subscribeEvents = useCallback(() => {
    void run("Subscribe to active note changes", async () => {
      const unsubscribe = await alt.events.subscribe("activeNoteChanged", (note) => {
        setActiveNote(note);
        pushLog("activeNoteChanged", note ?? "No active note selected");
      });
      setSubscribed(true);
      pushLog("Subscribed", "Listening for active note changes for 30 seconds.");

      window.setTimeout(() => {
        void unsubscribe().then(() => {
          setSubscribed(false);
          pushLog("Unsubscribed", "Stopped listening for active note changes.");
        });
      }, 30_000);
    });
  }, [pushLog, run]);

  const createNote = useCallback(() => {
    void run("Create note", async () => {
      const note = await alt.actions.invoke("notes.create", {
        title: `Plugin note ${new Date().toLocaleTimeString()}`,
        folderId: null,
      });
      if (note.id) {
        await alt.actions.invoke("notes.select", { noteId: note.id });
      }
      pushLog("Created note", note);
    });
  }, [pushLog, run]);

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-5">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <Badge variant={isAlt ? "default" : "secondary"}>
              {isAlt ? "Alt runtime connected" : "Local browser preview"}
            </Badge>
            <div>
              <h1 className="text-3xl font-semibold tracking-normal">React Plugin Template</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                A small, production-shaped starting point for Alt plugins built with React, Tailwind
                CSS, shadcn/ui, and the Alt Plugin SDK.
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={readState}>
            <PanelRightOpen />
            Read state
          </Button>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="size-5 text-primary" />
                Active note
              </CardTitle>
              <CardDescription>Permissioned app state exposed by the host.</CardDescription>
            </CardHeader>
            <CardContent>
              {activeNote ? (
                <div className="space-y-1 text-sm">
                  <p className="font-medium">{activeNote.title}</p>
                  <p className="text-muted-foreground">
                    #{activeNote.id} · {activeNote.status}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No note has been loaded yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-primary" />
                SDK checks
              </CardTitle>
              <CardDescription>
                Exercise the default storage, events, and note action examples.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-3">
              <Button variant="secondary" onClick={writeStorage}>
                <Database />
                Storage
              </Button>
              <Button variant={subscribed ? "default" : "secondary"} onClick={subscribeEvents}>
                <Bell />
                Events
              </Button>
              <Button variant="secondary" onClick={createNote}>
                <FilePlus2 />
                Note
              </Button>
            </CardContent>
          </Card>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Activity log</CardTitle>
            <CardDescription>
              Keep this panel while you replace the sample behavior.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {logs.length > 0 ? (
              <div className="space-y-3">
                {logs.map((entry) => (
                  <div key={entry.id} className="rounded-md border bg-background p-3">
                    <p className="text-sm font-medium">{entry.label}</p>
                    <pre className="mt-2 overflow-auto whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
                      {entry.detail}
                    </pre>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Use the controls above to call the SDK.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
