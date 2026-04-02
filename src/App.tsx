import './App.css'

import { Routes, Route } from "react-router-dom"
import Register from "./pages/register.tsx"
import Login from "./pages/login.tsx"
import Chat from "./pages/chat.tsx"
import Landing from "./pages/landing.tsx"

function App() {
    return (
        <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/register" element={<Register />} />
            <Route path="/login" element={<Login />} />
            <Route path="/chat" element={<Chat />} />
        </Routes>
    )
}

export default App
