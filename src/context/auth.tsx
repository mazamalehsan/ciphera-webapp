import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface AuthUser {
    uuid: string;
    username: string;
    publicKey: string;
    encryptionKey: string; // X25519 public key
}

interface AuthState {
    token: string | null;
    user: AuthUser | null;
    privateKey: string | null; // base64 Ed25519 private key (in memory only)
}

interface AuthContextValue extends AuthState {
    login: (token: string, user: AuthUser, privateKey: string) => void;
    logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [auth, setAuth] = useState<AuthState>({
        token: null,
        user: null,
        privateKey: null,
    });

    const login = useCallback((token: string, user: AuthUser, privateKey: string) => {
        setAuth({ token, user, privateKey });
    }, []);

    const logout = useCallback(() => {
        setAuth({ token: null, user: null, privateKey: null });
    }, []);

    return (
        <AuthContext.Provider value={{ ...auth, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used within AuthProvider");
    return ctx;
}
