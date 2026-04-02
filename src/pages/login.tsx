import { useState, useRef } from "react";
import { toast, ToastContainer } from "react-toastify";
import { useNavigate } from "react-router-dom";
import * as CBOR from "cbor-web";
import { decryptPrivateKeyFromFile, signMessage } from "../encryption";
import { getLoginChallenge, loginWithSignedChallenge, fetchUserByUsername } from "../httpClient";
import { useAuth } from "../context/auth.tsx";

const TOAST_CONTAINER_ID = "login-toast";

export default function Login() {
    const [passphrase, setPassphrase] = useState("");
    const [loading, setLoading] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const navigate = useNavigate();
    const { login } = useAuth();

    const handleLogin = async () => {
        const file = fileRef.current?.files?.[0];
        if (!file) {
            toast.error("Please select your .ciphera key file.", { containerId: TOAST_CONTAINER_ID });
            return;
        }
        if (!passphrase) {
            toast.error("Please enter your passphrase.", { containerId: TOAST_CONTAINER_ID });
            return;
        }

        setLoading(true);

        try {
            // Read and decode CBOR key file
            const fileBuffer = await file.arrayBuffer();
            const keyData = CBOR.decode(new Uint8Array(fileBuffer)) as {
                s: string;   // salt base64
                i: number;   // iterations
                pk: string;  // encrypted private key base64
                iv: string;  // iv base64
                un: string;  // username
            };

            // Decrypt private key
            const privateKeyBase64 = await decryptPrivateKeyFromFile(
                keyData.pk,
                keyData.iv,
                keyData.s,
                keyData.i,
                passphrase
            );

            const username = keyData.un;

            // Get challenge from server
            const { challenge, loginId } = await getLoginChallenge(username);

            // Sign challenge with Ed25519 private key
            const signedChallenge = signMessage(privateKeyBase64, challenge);

            // Submit signed challenge
            const { token } = await loginWithSignedChallenge(username, signedChallenge, loginId);

            // Fetch user info
            const user = await fetchUserByUsername(token, username);

            // Store auth state (private key stays in memory only)
            login(token, {
                uuid: user.UUID,
                username: user.Username,
                publicKey: user.PublicKey,
                encryptionKey: user.EncryptionKey,
            }, privateKeyBase64);

            toast.success("Logged in!", { containerId: TOAST_CONTAINER_ID });
            setTimeout(() => navigate("/chat"), 500);
        } catch (err: any) {
            const msg = err?.message || "Login failed. Check your key file and passphrase.";
            toast.error(msg, { containerId: TOAST_CONTAINER_ID });
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <h1>Login</h1>
            <br />
            <label>Key file (.ciphera)</label>
            <br />
            <input type="file" accept=".ciphera" ref={fileRef} />
            <br /><br />
            <input
                placeholder="Passphrase"
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
            />
            <br /><br />
            <button onClick={handleLogin} disabled={loading}>
                {loading ? "Logging in..." : "Login"}
            </button>
            <ToastContainer containerId={TOAST_CONTAINER_ID} />
        </>
    );
}
