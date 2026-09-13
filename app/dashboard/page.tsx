"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";
import { supabase } from "@/lib/supabase";

type UserProfile = {
  id: string;
  user_id: string;
  company_id: string | null;
  full_name: string;
  email: string | null;
  role: string | null;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: string[];
};

const QUICK_QUESTIONS = [
  "What needs my attention today?",
  "How is JINLAB doing?",
  "Which repairs need attention?",
  "What should I focus on next?",
];

export default function DashboardPage() {
  const router = useRouter();
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(true);

  const [question, setQuestion] = useState("");
  const [thinking, setThinking] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [attachments, setAttachments] = useState<File[]>([]);

  useEffect(() => {
    async function loadDashboard() {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user) {
        router.replace("/login");
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from("user_profile")
        .select("id, user_id, company_id, full_name, email, role")
        .eq("user_id", user.id)
        .single();

      if (profileError || !profileData) {
        setErrorMessage("Your Nexus profile could not be loaded.");
        setLoading(false);
        return;
      }

      setProfile(profileData);

      if (profileData.company_id) {
        const { data: company } = await supabase
          .from("company")
          .select("company_name")
          .eq("id", profileData.company_id)
          .single();

        setCompanyName(company?.company_name ?? "");
      }

      setLoading(false);
    }

    void loadDashboard();
  }, [router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages, thinking]);

  function fileToDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () =>
        resolve(String(reader.result || ""));

      reader.onerror = () =>
        reject(new Error(`Nexus could not read ${file.name}.`));

      reader.readAsDataURL(file);
    });
  }

  async function askNexus(customQuestion?: string) {
    const filesForRequest = [...attachments];

    const finalQuestion =
      customQuestion?.trim() ||
      question.trim() ||
      (filesForRequest.length
        ? "Read and analyse the attached document. Tell me what matters most and wait for my follow-up questions."
        : "");

    if (!finalQuestion || thinking) return;

    const previousMessages = messages;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: finalQuestion,
      attachments: filesForRequest.map((file) => file.name),
    };

    const assistantId = crypto.randomUUID();

    setThinking(true);
    setErrorMessage("");
    setQuestion("");
    setAttachments([]);

    setMessages((current) => [
      ...current,
      userMessage,
      {
        id: assistantId,
        role: "assistant",
        content: "",
      },
    ]);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Your Nexus session has expired.");
      }

      const encodedAttachments = await Promise.all(
        filesForRequest.map(async (file) => ({
          name: file.name,
          type: file.type,
          size: file.size,
          dataUrl: await fileToDataUrl(file),
        }))
      );

      const response = await fetch("/api/nexus-ai/cto", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          question: finalQuestion,
          history: previousMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          attachments: encodedAttachments,
        }),
      });

      if (!response.ok) {
        let message = "Nexus CTO could not analyse JINLAB.";

        try {
          const payload = await response.json();
          message = payload?.error || message;
        } catch {}

        throw new Error(message);
      }

      if (!response.body) {
        throw new Error("Nexus CTO response stream is unavailable.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let firstChunk = true;

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        const chunk = decoder.decode(value, {
          stream: true,
        });

        if (!chunk) continue;

        if (firstChunk) {
          firstChunk = false;
          setThinking(false);
        }

        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  content: message.content + chunk,
                }
              : message
          )
        );
      }

      setThinking(false);
    } catch (error) {
      setThinking(false);

      setMessages((current) =>
        current.filter(
          (message) =>
            !(
              message.id === assistantId &&
              !message.content
            )
        )
      );

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Nexus CTO encountered an unexpected error."
      );
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <DashboardLayout>
      <Navbar
        companyName={companyName}
        userName={profile?.full_name ?? ""}
        onLogout={logout}
      />

      <main className="mx-auto flex min-h-[calc(100vh-64px)] w-full max-w-5xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="h-10 w-10 animate-pulse rounded-2xl bg-blue-600" />
          </div>
        ) : profile?.role !== "owner" ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-muted-foreground">
              Nexus CTO is currently available to the company owner.
            </p>
          </div>
        ) : (
          <>
            {messages.length === 0 && (
              <section className="flex flex-1 flex-col items-center justify-center pb-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-lg font-bold text-white shadow-sm">
                  AI
                </div>

                <h1 className="mt-5 text-3xl font-bold tracking-tight">
                  Nexus CTO
                </h1>

                <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                  Ask about JINLAB. Nexus will analyse the business and give you
                  the most useful answer without overwhelming you.
                </p>

                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {QUICK_QUESTIONS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => void askNexus(item)}
                      className="rounded-full border bg-background px-4 py-2 text-sm transition hover:border-blue-300 hover:bg-blue-50"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {messages.length > 0 && (
              <section className="flex-1 space-y-6 pb-8">
                {messages
                  .filter(
                    (message) =>
                      message.role === "user" ||
                      message.content.trim()
                  )
                  .map((message) => (
                  <div
                    key={message.id}
                    className={
                      message.role === "user"
                        ? "flex justify-end"
                        : "flex justify-start"
                    }
                  >
                    {message.role === "user" ? (
                      <div className="max-w-[80%] rounded-2xl rounded-br-md bg-blue-600 px-4 py-3 text-sm leading-6 text-white">
                        {message.attachments?.length ? (
                          <div className="mb-2 flex flex-wrap gap-1.5">
                            {message.attachments.map((name) => (
                              <span
                                key={name}
                                className="rounded-md bg-white/15 px-2 py-1 text-xs"
                              >
                                {name}
                              </span>
                            ))}
                          </div>
                        ) : null}

                        {message.content}
                      </div>
                    ) : (
                      <div className="max-w-3xl">
                        <div className="mb-2 flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-[10px] font-bold text-white">
                            AI
                          </div>
                          <span className="text-sm font-semibold">
                            Nexus CTO
                          </span>
                        </div>

                        <div className="whitespace-pre-wrap text-[15px] leading-7">
                          {message.content}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {thinking && (
                  <div className="flex justify-start">
                    <div className="max-w-md rounded-2xl border bg-card px-5 py-4 shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600">
                          <div className="absolute h-3 w-3 animate-ping rounded-full bg-white/70" />
                          <div className="relative h-2 w-2 rounded-full bg-white" />
                        </div>

                        <div>
                          <p className="text-sm font-semibold">
                            Nexus is thinking
                          </p>

                          <div className="mt-2 flex gap-1">
                            <span className="h-1.5 w-8 animate-pulse rounded-full bg-blue-600" />
                            <span className="h-1.5 w-5 animate-pulse rounded-full bg-blue-400" />
                            <span className="h-1.5 w-3 animate-pulse rounded-full bg-blue-300" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={bottomRef} />
              </section>
            )}

            {errorMessage && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {errorMessage}
              </div>
            )}

            <section className="sticky bottom-0 mt-auto bg-background/95 pb-4 pt-3 backdrop-blur">
              <div className="rounded-2xl border bg-card p-3 shadow-lg">
                <textarea
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      !event.shiftKey &&
                      !thinking
                    ) {
                      event.preventDefault();
                      void askNexus();
                    }
                  }}
                  rows={2}
                  placeholder={
                    messages.length
                      ? "Ask a follow-up"
                      : "Ask Nexus CTO about JINLAB"
                  }
                  className="w-full resize-none border-0 bg-transparent px-2 py-2 text-[15px] leading-6 outline-none placeholder:text-muted-foreground"
                />

                {attachments.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {attachments.map((file, index) => (
                      <button
                        key={`${file.name}-${index}`}
                        type="button"
                        onClick={() =>
                          setAttachments((current) =>
                            current.filter((_, i) => i !== index)
                          )
                        }
                        className="rounded-lg border bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700"
                        title="Remove attachment"
                      >
                        {file.name} ×
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between gap-3">
                  <label className="cursor-pointer rounded-lg px-2 py-2 text-xs font-semibold text-blue-600 transition hover:bg-blue-50">
                    Attach document
                    <input
                      type="file"
                      multiple
                      accept=".pdf,.doc,.docx,.rtf,.odt,.ppt,.pptx,.txt,.md,.json,.html,.xml,.csv,.xls,.xlsx"
                      className="hidden"
                      onChange={(event) => {
                        const selected = Array.from(
                          event.target.files ?? []
                        );

                        const next = [
                          ...attachments,
                          ...selected,
                        ].slice(0, 4);

                        const total = next.reduce(
                          (sum, file) => sum + file.size,
                          0
                        );

                        if (total > 2_800_000) {
                          setErrorMessage(
                            "Documents are too large. Keep attachments below 2.8 MB total for now."
                          );
                        } else {
                          setErrorMessage("");
                          setAttachments(next);
                        }

                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                  {messages.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setMessages([]);
                        setQuestion("");
                        setErrorMessage("");
                      }}
                      className="px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                      New conversation
                    </button>
                  ) : (
                    <span />
                  )}

                  <button
                    type="button"
                    onClick={() => void askNexus()}
                    disabled={thinking || (!question.trim() && attachments.length === 0)}
                    className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Ask Nexus
                  </button>
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </DashboardLayout>
  );
}
