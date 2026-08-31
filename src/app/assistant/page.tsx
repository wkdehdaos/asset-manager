import { AssistantClient } from "./assistant-client";

export const dynamic = "force-dynamic";

export default function AssistantPage() {
  return (
    <main className="mx-auto max-w-lg px-4 py-4">
      <AssistantClient />
    </main>
  );
}
