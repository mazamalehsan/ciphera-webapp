import { useState, useEffect, useRef, useCallback } from "react";
import { toast, ToastContainer } from "react-toastify";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/auth.tsx";
import { encryptDirectMessage, decryptDirectMessage, encryptGroupMessage, decryptGroupMessage } from "../encryption";
import {
    fetchUserByUsername,
    sendMessageApi,
    getConversationMessages,
    getGroupMessages,
    createGroup,
    getMyGroups,
    getGroupMembers,
} from "../httpClient";

const TOAST_ID = "chat-toast";
const WS_URL = "ws://localhost:1200";

interface ChatContact {
    type: "dm" | "group";
    id: string;          // userId or groupId
    name: string;
    encryptionKey?: string;  // X25519 public key, for DM
}

interface ChatMessage {
    id: string;
    from: string;
    fromUsername?: string;
    content: string;     // decrypted plaintext
    createdAt: string;
    mine: boolean;
}

export default function Chat() {
    const { token, user, privateKey, logout } = useAuth();
    const navigate = useNavigate();

    const [contacts, setContacts] = useState<ChatContact[]>([]);
    const [activeContact, setActiveContact] = useState<ChatContact | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [searchUser, setSearchUser] = useState("");
    const [groupName, setGroupName] = useState("");
    const [groupMembers, setGroupMembersInput] = useState("");

    const wsRef = useRef<WebSocket | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!token || !user) {
            navigate("/login");
            return;
        }
        loadGroups();
        connectWebSocket();
        return () => wsRef.current?.close();
    }, [token]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const connectWebSocket = () => {
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
            // Authenticate
            ws.send(JSON.stringify({ action: "auth", token, userId: user!.uuid }));
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.action === "newMessage") {
                    handleIncomingMessage(data);
                }
            } catch {
                // keepalive or binary ping
            }
        };

        ws.onclose = () => {
            // Reconnect after 3s
            setTimeout(() => {
                if (token) connectWebSocket();
            }, 3000);
        };
    };

    const handleIncomingMessage = useCallback(async (data: any) => {
        if (!privateKey || !user) return;

        try {
            let plaintext: string;
            if (data.groupId) {
                plaintext = await decryptGroupMessage(
                    data.content,
                    data.iv,
                    user.uuid,
                    privateKey,
                    data.senderEncryptionKey,
                    data.keys || []
                );
            } else {
                plaintext = await decryptDirectMessage(
                    data.content,
                    data.iv,
                    privateKey,
                    data.senderEncryptionKey
                );
            }

            const msg: ChatMessage = {
                id: data.uuid || Date.now().toString(),
                from: data.from,
                fromUsername: data.fromUsername,
                content: plaintext,
                createdAt: data.createdAt || new Date().toISOString(),
                mine: data.from === user.uuid,
            };

            setMessages((prev) => [...prev, msg]);
        } catch (err) {
            console.error("Failed to decrypt incoming message", err);
        }
    }, [privateKey, user]);

    const loadGroups = async () => {
        if (!token) return;
        try {
            const groups = await getMyGroups(token);
            if (groups) {
                const groupContacts: ChatContact[] = groups.map((g: any) => ({
                    type: "group" as const,
                    id: g.UUID,
                    name: g.Name,
                }));
                setContacts((prev) => {
                    const dms = prev.filter((c) => c.type === "dm");
                    return [...dms, ...groupContacts];
                });
            }
        } catch {
            // no groups yet
        }
    };

    const startDM = async () => {
        if (!searchUser.trim() || !token) return;
        try {
            const found = await fetchUserByUsername(token, searchUser.trim());
            if (!found || !found.UUID) {
                toast.error("User not found.", { containerId: TOAST_ID });
                return;
            }
            if (found.UUID === user!.uuid) {
                toast.error("Can't message yourself.", { containerId: TOAST_ID });
                return;
            }

            const existing = contacts.find((c) => c.type === "dm" && c.id === found.UUID);
            if (!existing) {
                const newContact: ChatContact = {
                    type: "dm",
                    id: found.UUID,
                    name: found.Username,
                    encryptionKey: found.EncryptionKey,
                };
                setContacts((prev) => [newContact, ...prev]);
                setActiveContact(newContact);
            } else {
                setActiveContact(existing);
            }
            setSearchUser("");
            loadConversation(found.UUID, "dm", found.EncryptionKey);
        } catch (err: any) {
            toast.error(err?.message || "User not found.", { containerId: TOAST_ID });
        }
    };

    const handleCreateGroup = async () => {
        if (!groupName.trim() || !token) return;
        try {
            const memberNames = groupMembers.split(",").map((m) => m.trim()).filter(Boolean);
            const group = await createGroup(token, groupName.trim(), memberNames);
            toast.success("Group created!", { containerId: TOAST_ID });
            setGroupName("");
            setGroupMembersInput("");
            loadGroups();
        } catch (err: any) {
            toast.error(err?.message || "Failed to create group.", { containerId: TOAST_ID });
        }
    };

    const selectContact = (contact: ChatContact) => {
        setActiveContact(contact);
        if (contact.type === "dm") {
            loadConversation(contact.id, "dm", contact.encryptionKey);
        } else {
            loadConversation(contact.id, "group");
        }

        // Join WS room for groups
        if (contact.type === "group" && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ action: "joinRoom", roomName: contact.id }));
        }
    };

    const loadConversation = async (id: string, type: "dm" | "group", pubKey?: string) => {
        if (!token || !privateKey || !user) return;
        setMessages([]);

        try {
            let rawMessages: any[];
            if (type === "dm") {
                rawMessages = (await getConversationMessages(token, id)) || [];
            } else {
                rawMessages = (await getGroupMessages(token, id)) || [];
            }

            const decrypted: ChatMessage[] = [];

            for (const msg of rawMessages) {
                try {
                    let plaintext: string;
                    if (type === "dm") {
                        // For DM: if I sent it, decrypt with my priv + their pub.
                        // If they sent it, decrypt with my priv + their pub. Same ECDH either way.
                        const otherEncKey = pubKey || msg.SenderEncryptionKey;
                        plaintext = await decryptDirectMessage(
                            msg.Content,
                            msg.IV,
                            privateKey,
                            otherEncKey
                        );
                    } else {
                        plaintext = await decryptGroupMessage(
                            msg.Content,
                            msg.IV,
                            user.uuid,
                            privateKey,
                            msg.SenderPublicKey,
                            msg.Keys || []
                        );
                    }

                    decrypted.push({
                        id: msg.UUID,
                        from: msg.From,
                        fromUsername: msg.FromUsername,
                        content: plaintext,
                        createdAt: msg.CreatedAt,
                        mine: msg.From === user.uuid,
                    });
                } catch {
                    decrypted.push({
                        id: msg.UUID,
                        from: msg.From,
                        content: "[unable to decrypt]",
                        createdAt: msg.CreatedAt,
                        mine: msg.From === user.uuid,
                    });
                }
            }

            setMessages(decrypted);
        } catch {
            // empty conversation
        }
    };

    const sendMessage = async () => {
        if (!input.trim() || !activeContact || !token || !privateKey || !user) return;

        try {
            if (activeContact.type === "dm") {
                if (!activeContact.encryptionKey) return;

                const { ciphertext, iv } = await encryptDirectMessage(
                    input,
                    privateKey,
                    activeContact.encryptionKey
                );

                await sendMessageApi(token, {
                    To: activeContact.id,
                    Content: ciphertext,
                    IV: iv,
                });

                // Show locally
                setMessages((prev) => [
                    ...prev,
                    {
                        id: Date.now().toString(),
                        from: user.uuid,
                        content: input,
                        createdAt: new Date().toISOString(),
                        mine: true,
                    },
                ]);
            } else {
                // Group message
                const members = await getGroupMembers(token, activeContact.id);
                if (!members) return;

                const memberKeys = members
                    .filter((m: any) => m.UUID !== user.uuid)
                    .map((m: any) => ({ userId: m.UUID, encryptionKey: m.EncryptionKey }));

                // Include self so we can decrypt our own messages
                memberKeys.push({ userId: user.uuid, encryptionKey: user.encryptionKey });

                const { ciphertext, iv, keys } = await encryptGroupMessage(
                    input,
                    privateKey,
                    memberKeys
                );

                await sendMessageApi(token, {
                    GroupId: activeContact.id,
                    Content: ciphertext,
                    IV: iv,
                    Keys: keys.map((k) => ({
                        UserId: k.userId,
                        EncryptedKey: k.encryptedKey,
                        KeyIV: k.keyIv,
                    })),
                });

                setMessages((prev) => [
                    ...prev,
                    {
                        id: Date.now().toString(),
                        from: user.uuid,
                        content: input,
                        createdAt: new Date().toISOString(),
                        mine: true,
                    },
                ]);
            }

            setInput("");
        } catch (err: any) {
            toast.error(err?.message || "Failed to send.", { containerId: TOAST_ID });
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    const handleLogout = () => {
        logout();
        navigate("/login");
    };

    return (
        <div style={{ display: "flex", height: "90vh", gap: "1rem", textAlign: "left" }}>
            {/* Sidebar */}
            <div style={{ width: "280px", borderRight: "1px solid #444", padding: "1rem", overflowY: "auto" }}>
                <div style={{ marginBottom: "1rem" }}>
                    <strong>{user?.username}</strong>
                    <button onClick={handleLogout} style={{ marginLeft: "0.5rem", fontSize: "0.8em" }}>
                        Logout
                    </button>
                </div>

                {/* Search / Start DM */}
                <div style={{ marginBottom: "1rem" }}>
                    <input
                        placeholder="Username to message"
                        value={searchUser}
                        onChange={(e) => setSearchUser(e.target.value)}
                        style={{ width: "100%" }}
                    />
                    <button onClick={startDM} style={{ width: "100%", marginTop: "0.3rem" }}>
                        Start Chat
                    </button>
                </div>

                {/* Create Group */}
                <div style={{ marginBottom: "1rem" }}>
                    <input
                        placeholder="Group name"
                        value={groupName}
                        onChange={(e) => setGroupName(e.target.value)}
                        style={{ width: "100%" }}
                    />
                    <input
                        placeholder="Members (comma-separated)"
                        value={groupMembers}
                        onChange={(e) => setGroupMembersInput(e.target.value)}
                        style={{ width: "100%", marginTop: "0.3rem" }}
                    />
                    <button onClick={handleCreateGroup} style={{ width: "100%", marginTop: "0.3rem" }}>
                        Create Group
                    </button>
                </div>

                {/* Contact List */}
                <div>
                    {contacts.map((c) => (
                        <div
                            key={c.id}
                            onClick={() => selectContact(c)}
                            style={{
                                padding: "0.5rem",
                                cursor: "pointer",
                                borderRadius: "4px",
                                backgroundColor: activeContact?.id === c.id ? "#333" : "transparent",
                                marginBottom: "0.25rem",
                            }}
                        >
                            {c.type === "group" ? `# ${c.name}` : c.name}
                        </div>
                    ))}
                </div>
            </div>

            {/* Chat Area */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "1rem" }}>
                {activeContact ? (
                    <>
                        <h2 style={{ margin: 0, marginBottom: "1rem" }}>
                            {activeContact.type === "group" ? `# ${activeContact.name}` : activeContact.name}
                        </h2>

                        {/* Messages */}
                        <div style={{ flex: 1, overflowY: "auto", marginBottom: "1rem" }}>
                            {messages.map((msg) => (
                                <div
                                    key={msg.id}
                                    style={{
                                        marginBottom: "0.5rem",
                                        textAlign: msg.mine ? "right" : "left",
                                    }}
                                >
                                    <div
                                        style={{
                                            display: "inline-block",
                                            padding: "0.5rem 0.75rem",
                                            borderRadius: "8px",
                                            backgroundColor: msg.mine ? "#4a4aff" : "#333",
                                            maxWidth: "70%",
                                            wordBreak: "break-word",
                                        }}
                                    >
                                        {!msg.mine && msg.fromUsername && (
                                            <div style={{ fontSize: "0.75em", opacity: 0.7, marginBottom: "0.2rem" }}>
                                                {msg.fromUsername}
                                            </div>
                                        )}
                                        {msg.content}
                                    </div>
                                    <div style={{ fontSize: "0.7em", opacity: 0.5, marginTop: "0.15rem" }}>
                                        {new Date(msg.createdAt).toLocaleTimeString()}
                                    </div>
                                </div>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input */}
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                            <input
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Type a message..."
                                style={{ flex: 1 }}
                            />
                            <button onClick={sendMessage}>Send</button>
                        </div>
                    </>
                ) : (
                    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.5 }}>
                        Select a conversation or start a new one
                    </div>
                )}
            </div>

            <ToastContainer containerId={TOAST_ID} />
        </div>
    );
}
