"use client";

import { useState } from "react";

import type { Agent, RealtimeModel, VoiceProvider } from "@voiceplatform/shared";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  agent: Agent;
}

const VOICE_PROVIDERS: VoiceProvider[] = [
  "openai-realtime",
  "gemini-live",
  "elevenlabs",
  "cartesia",
  "playht",
  "cloned",
];

const REALTIME_MODELS: RealtimeModel[] = [
  "gpt-4o-mini-realtime",
  "gpt-4o-realtime",
  "gemini-live-2.0",
];

export function AgentEditor({ agent }: Props) {
  const [draft, setDraft] = useState<Agent>(agent);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const isNew = agent._id === "new";

  async function save() {
    setSaving(true);
    try {
      // Real save wires through @/lib/api → /agents POST|PUT once Stream S1
      // delivers the endpoint. For now keep the optimistic local state.
      await new Promise((resolve) => setTimeout(resolve, 250));
      setSavedAt(new Date());
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">
            {isNew ? "New agent" : draft.name || "(unnamed agent)"}
          </h1>
          <p className="text-sm text-zinc-500">
            Status: <span className="font-medium">{draft.status}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          {savedAt && (
            <span className="text-xs text-zinc-500">
              Saved {savedAt.toLocaleTimeString()}
            </span>
          )}
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : isNew ? "Create" : "Save"}
          </Button>
        </div>
      </div>

      <div className="mb-6 space-y-1">
        <Label htmlFor="name">Agent name</Label>
        <Input
          id="name"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="e.g. Inbound qualifier"
        />
      </div>

      <Tabs defaultValue="prompt" className="space-y-4">
        <TabsList>
          <TabsTrigger value="prompt">Prompt</TabsTrigger>
          <TabsTrigger value="voice">Voice</TabsTrigger>
          <TabsTrigger value="model">Model</TabsTrigger>
        </TabsList>

        <TabsContent value="prompt">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="space-y-1">
                <Label htmlFor="greeting">Greeting</Label>
                <Textarea
                  id="greeting"
                  rows={3}
                  value={draft.greeting}
                  onChange={(e) => setDraft({ ...draft, greeting: e.target.value })}
                  placeholder="What the agent says when the call connects."
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="prompt">System prompt</Label>
                <Textarea
                  id="prompt"
                  rows={16}
                  value={draft.prompt}
                  onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
                  placeholder="Define the agent's role, tone, and rules."
                  className="font-mono text-sm"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="voice">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="space-y-1">
                <Label htmlFor="voice-provider">Provider</Label>
                <Select
                  value={draft.voice.provider}
                  onValueChange={(value) =>
                    setDraft({
                      ...draft,
                      voice: { ...draft.voice, provider: value as VoiceProvider },
                    })
                  }
                >
                  <SelectTrigger id="voice-provider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VOICE_PROVIDERS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="voice-id">Voice id</Label>
                <Input
                  id="voice-id"
                  value={draft.voice.providerVoiceId}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      voice: { ...draft.voice, providerVoiceId: e.target.value },
                    })
                  }
                  placeholder="e.g. alloy, rachel, custom-clone-id"
                />
              </div>
              <p className="text-xs text-zinc-500">
                Clone library + audio preview ship with Stream S6.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="model">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="space-y-1">
                <Label htmlFor="model">Realtime model</Label>
                <Select
                  value={draft.llm.realtimeModel}
                  onValueChange={(value) =>
                    setDraft({
                      ...draft,
                      llm: { ...draft.llm, realtimeModel: value as RealtimeModel },
                    })
                  }
                >
                  <SelectTrigger id="model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REALTIME_MODELS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="temperature">
                  Temperature ({draft.llm.temperature.toFixed(2)})
                </Label>
                <Input
                  id="temperature"
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  value={draft.llm.temperature}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      llm: {
                        ...draft.llm,
                        temperature: Number(e.target.value),
                      },
                    })
                  }
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
