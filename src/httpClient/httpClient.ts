const API_SERVER_URL="http://localhost:4040"

import axios from "axios"


const httpClient  = axios.create({
    baseURL: API_SERVER_URL,
    timeout: 15000,
    headers: {
        "Content-Type": "application/json"
    }
})

httpClient.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem("accessToken")
        if (token) {
            config.headers.Authorization = `Bearer ${token}`
        }
        return config
    },
    (error) => Promise.reject(error)
)

httpClient.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response) {
            return Promise.reject({
                status: error.response.status,
                message: error.response.data?.message || "Server error",
                data: error.response.data
            })
        }
        return Promise.reject({
            status: 0,
            message: "Network error"
        })
    }
)

export default httpClient