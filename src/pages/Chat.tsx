import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAuthData, clearAuthData, AuthData } from "@/lib/auth";
import { Message } from "@/lib/mcp-client";
import {
    Send,
    Square,
    LogOut,
    Mail,
    User,
    Bot,
    Loader2,
} from "lucide-react";
import OpenAI from "openai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";

const groq = new OpenAI({
    baseURL: "https://api.groq.com/openai/v1",
    apiKey: import.meta.env.VITE_GROQ_TOKEN,
    dangerouslyAllowBrowser: true,
});

const Chat = () => {
    const navigate = useNavigate();
    const [authData, setAuthData] = useState<AuthData | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const syncEmails = async (auth: AuthData) => {
        try {
            setIsSyncing(true);
            await fetch("https://mail-agent.fastmcp.app/api/sync-emails", {
                method: "POST",
                body: JSON.stringify({
                    max_fetch: 50,
                }),
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${auth.accessToken}`
                },
            });
        } catch (err) {
            console.error("Email sync failed:", err);
        } finally {
            setIsSyncing(false);
        }
    };

    const clearContext = async (auth: AuthData) => {
        try {
            await fetch("https://mail-agent.fastmcp.app/api/context/clear", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${auth.accessToken}`
                },
            });
        } catch (err) {
            console.error("Email sync failed:", err);
        }
    }

    const isTokenExpired = (auth: AuthData): boolean => {
        if (!auth.expiresAt) return false;
        return Date.now() >= auth.expiresAt;
    };

    const checkAndRefreshAuth = (): AuthData | null => {
        const auth = getAuthData();

        if (!auth) {
            navigate("/");
            return null;
        }

        if (isTokenExpired(auth)) {
            clearAuthData();
            navigate("/");
            return null;
        }

        return auth;
    };

    useEffect(() => {
        const auth = checkAndRefreshAuth();
        if (auth) {
            setAuthData(auth);
            syncEmails(auth);
            clearContext(auth)
        }
    }, [navigate]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    async function fetchContext(accessToken: string) {
        const res = await fetch("https://mail-agent.fastmcp.app/api/context", {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (!res.ok) return [];

        const data = await res.json();
        return data.context ?? [];
    }

    function contextToMessages(context: any[]) {
        return context.map((c) => ({
            role: c.role,
            content:
                typeof c.content === "string"
                    ? c.content
                    : JSON.stringify(c.content),
        }));
    }

    const handleSend = async () => {
        if (!input.trim()) return;

        // Check auth before sending
        const currentAuth = checkAndRefreshAuth();
        if (!currentAuth) return;

        const userInput = input;
        setInput("");
        setIsLoading(true);
        setIsProcessing(true);

        const assistantMessageId = crypto.randomUUID();

        setMessages((prev) => [
            ...prev,
            {
                id: crypto.randomUUID(),
                role: "user",
                content: userInput,
                timestamp: new Date(),
            },
            {
                id: assistantMessageId,
                role: "assistant",
                content: "",
                timestamp: new Date(),
                isStreaming: true,
            },
        ]);

        try {
            const context = await fetchContext(currentAuth.accessToken);

            const messages = [
                ...contextToMessages(context),
                { role: "user", content: userInput },
            ];

            const response = await groq.responses.create({
                model: "moonshotai/kimi-k2-instruct-0905",
                input: messages,
                tools: [
                    {
                        type: "mcp",
                        server_label: "mail-agent",
                        server_url: "https://mail-agent.fastmcp.app/mcp",
                        require_approval: "never",
                        authorization: currentAuth.accessToken,
                    },
                ],
            });

            setIsProcessing(false);

            let fullContent = "";
            for (const output of response.output ?? []) {
                if (output.type === "message" && output.role === "assistant") {
                    for (const item of output.content ?? []) {
                        if (item.type === "output_text") {
                            fullContent += item.text;
                        }
                    }
                }
            }

            for (let i = 0; i < fullContent.length; i += 4) {
                const chunk = fullContent.slice(0, i + 4);

                setMessages((prev) =>
                    prev.map((m) =>
                        m.id === assistantMessageId
                            ? { ...m, content: chunk }
                            : m
                    )
                );

                await new Promise((r) => setTimeout(r, 12));
            }

            setMessages((prev) =>
                prev.map((m) =>
                    m.id === assistantMessageId
                        ? { ...m, content: fullContent, isStreaming: false }
                        : m
                )
            );
        } catch (err: any) {
            setMessages((prev) =>
                prev.map((m) =>
                    m.id === assistantMessageId
                        ? {
                            ...m,
                            content: `❌ ${err.message || "Unknown error"}`,
                            isStreaming: false,
                        }
                        : m
                )
            );
        } finally {
            setIsLoading(false);
            setIsProcessing(false);
        }
    };

    const handleStop = () => {
        setMessages((prev) =>
            prev.map((msg) =>
                msg.isStreaming ? { ...msg, isStreaming: false } : msg
            )
        );
        setIsLoading(false);
        setIsProcessing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleLogout = () => {
        clearAuthData();
        navigate("/");
    };

    return (
        <div className="min-h-screen flex flex-col bg-background">
            <header className="border-b border-border px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Mail className="w-5 h-5 text-primary" />
                    </div>
                    <span className="font-semibold text-foreground">MCP Mail</span>
                </div>

                {authData && (
                    <div className="flex items-center gap-4">
                        <span className="text-sm text-muted-foreground">
                            {authData.email}
                        </span>
                        <button
                            onClick={handleLogout}
                            className="p-2 rounded-lg hover:bg-secondary transition-colors"
                        >
                            <LogOut className="w-4 h-4 text-muted-foreground" />
                        </button>
                    </div>
                )}
            </header>

            {isSyncing && (
                <div className="mx-auto mt-4 mb-2 max-w-3xl px-4">
                    <div className="flex items-center gap-2 bg-secondary text-foreground px-4 py-2 rounded-lg animate-pulse">
                        <Mail className="w-4 h-4" />
                        <span className="text-sm">Syncing your emails…</span>
                    </div>
                </div>
            )}

            {isProcessing && (
                <div className="mx-auto mt-4 mb-2 max-w-3xl px-4">
                    <div className="flex items-center gap-2 bg-primary/10 text-foreground px-4 py-2 rounded-lg">
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        <span className="text-sm">Processing your request…</span>
                    </div>
                </div>
            )}

            <main className="flex-1 overflow-y-auto">
                <div className="max-w-3xl mx-auto py-6 px-4">
                    {messages.length === 0 ? (
                        <div className="text-center py-20">
                            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                                <Mail className="w-8 h-8 text-primary" />
                            </div>
                            <h2 className="text-xl font-semibold text-foreground mb-2">
                                Ask about your emails
                            </h2>
                            <p className="text-muted-foreground">
                                Try "Fetch my recent mails" or "Do I have any mail for credit card bills?"
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {messages.map((msg) => (
                                <div
                                    key={msg.id}
                                    className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""
                                        }`}
                                >
                                    {msg.role === "assistant" && (
                                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex-shrink-0 flex items-center justify-center">
                                            <Bot className="w-4 h-4 text-primary" />
                                        </div>
                                    )}

                                    <div
                                        className={`max-w-[80%] rounded-2xl px-4 py-3 ${msg.role === "user"
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-secondary text-foreground"
                                            }`}
                                    >
                                        {msg.role === "assistant" ? (
                                            <ReactMarkdown
                                                remarkPlugins={[remarkGfm]}
                                                rehypePlugins={[rehypeRaw]}
                                            >
                                                {msg.content}
                                            </ReactMarkdown>
                                        ) : (
                                            <p className="whitespace-pre-wrap text-sm">
                                                {msg.content}
                                            </p>
                                        )}

                                        {msg.isStreaming && (
                                            <span className="inline-block w-2 h-4 bg-current animate-pulse ml-1" />
                                        )}
                                    </div>

                                    {msg.role === "user" && (
                                        <div className="w-8 h-8 rounded-lg bg-muted flex-shrink-0 flex items-center justify-center">
                                            <User className="w-4 h-4 text-muted-foreground" />
                                        </div>
                                    )}
                                </div>
                            ))}

                            <div ref={messagesEndRef} />
                        </div>
                    )}
                </div>
            </main>

            <div className="border-t border-border p-4">
                <div className="max-w-3xl mx-auto flex gap-3">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask about your emails..."
                        className="flex-1 resize-none rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                        rows={1}
                        disabled={isSyncing || isLoading}
                    />

                    <button
                        onClick={isLoading ? handleStop : handleSend}
                        disabled={(!input.trim() && !isLoading) || isSyncing}
                        className="px-4 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {isLoading ? <Square className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Chat;