Deno.test({
  name: "server persists instance changes and removes dangling instance references",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const command = new Deno.Command(Deno.execPath(), {
      args: [
        "run",
        "--allow-net=127.0.0.1,localhost",
        "--allow-read",
        "--allow-write",
        "--allow-run",
        "--allow-env",
        "--allow-ffi",
        "--allow-sys",
        "src/server.ts",
      ],
      stdout: "null",
      stderr: "piped",
    });
    const child = command.spawn();
    let original: Record<string, unknown> | null = null;

    try {
      await waitForServer(child);
      const loaded = await requestProject();
      original = structuredClone(loaded.manifest);
      const probe = structuredClone(loaded.manifest) as ProjectManifestProbe;
      const objectFile = probe.objects[0];
      if (!objectFile) throw new Error("Calculator template has no Object Type for instance lifecycle test.");

      probe.instances.push({ id: "ciReplica", objectFile, props: { label: "Replica" } });
      probe.instances.push({ id: "ciChild", objectFile, parent: { instanceId: "ciReplica", slot: "content" } });
      probe.rules.push({
        id: "ci-instance-rule",
        event: { instanceId: "ciReplica", name: "probe" },
        actions: [{ id: "ci-action", action: { instanceId: "ciReplica", name: "probe" }, inputs: {}, outputs: {} }],
      });

      const created = await saveManifest(probe);
      assert(created.manifest.instances.some((item) => item.id === "ciReplica"), "New instance was not persisted.");
      assert(created.manifest.instances.some((item) => item.id === "ciChild" && item.parent?.instanceId === "ciReplica"), "Child parent was not persisted.");
      assert(created.manifest.rules.some((rule) => rule.id === "ci-instance-rule"), "Rule for new instance was not persisted.");

      const deleted = structuredClone(created.manifest);
      deleted.instances = deleted.instances.filter((item) => item.id !== "ciReplica");
      const cleaned = await saveManifest(deleted);
      assert(!cleaned.manifest.instances.some((item) => item.id === "ciReplica"), "Deleted instance survived manifest sanitization.");
      const childInstance = cleaned.manifest.instances.find((item) => item.id === "ciChild");
      assert(childInstance && !childInstance.parent, "Child of a deleted instance must be promoted to a root instance.");
      assert(!cleaned.manifest.rules.some((rule) => rule.id === "ci-instance-rule"), "Rule with a deleted endpoint must be removed.");
    } finally {
      if (original) {
        await saveManifest(original as ProjectManifestProbe).catch(() => undefined);
      }
      try { child.kill("SIGTERM"); } catch { /* already stopped */ }
      await child.status.catch(() => undefined);
    }
  },
});

interface ProjectInstanceProbe {
  id: string;
  objectFile: string;
  props?: Record<string, unknown>;
  parent?: { instanceId: string; slot: string };
}

interface RuleProbe {
  id: string;
  event: { instanceId: string; name: string };
  actions: Array<{
    id: string;
    action: { instanceId: string; name: string };
    inputs: Record<string, unknown>;
    outputs: Record<string, unknown>;
  }>;
}

interface ProjectManifestProbe extends Record<string, unknown> {
  objects: string[];
  instances: ProjectInstanceProbe[];
  rules: RuleProbe[];
}

interface LoadedProjectProbe {
  manifest: ProjectManifestProbe;
}

async function waitForServer(child: Deno.ChildProcess): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt++) {
    const result = await Promise.race([
      child.status.then((status) => ({ type: "exit" as const, status })),
      fetch("http://127.0.0.1:8000/api/projects", { signal: AbortSignal.timeout(250) })
        .then((response) => ({ type: "response" as const, response }))
        .catch(() => ({ type: "retry" as const })),
    ]);
    if (result.type === "response" && result.response.ok) return;
    if (result.type === "exit") throw new Error(`Studio server exited early with code ${result.status.code}.`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Studio server did not become ready for instance lifecycle test.");
}

async function requestProject(): Promise<LoadedProjectProbe> {
  const response = await fetch("http://127.0.0.1:8000/api/projects/calculator-modular-demo");
  if (!response.ok) throw new Error(`Could not load test project: ${response.status}`);
  return await response.json() as LoadedProjectProbe;
}

async function saveManifest(manifest: ProjectManifestProbe): Promise<LoadedProjectProbe> {
  const response = await fetch("http://127.0.0.1:8000/api/projects/calculator-modular-demo", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ manifest }),
  });
  if (!response.ok) throw new Error(`Could not save test manifest: ${response.status} ${await response.text()}`);
  return await response.json() as LoadedProjectProbe;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
