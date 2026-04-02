const API_SERVER_URL="http://localhost:4040"

import axios from "axios"

declare module 'axios' {
    export interface InternalAxiosRequestConfig {
        authToken?: string;
    }
}

const httpClient = axios.create({
    baseURL: API_SERVER_URL,
    timeout: 15000,
    headers: {
        "Content-Type": "application/json"
    }
})


httpClient.interceptors.request.use(
    (config) => {
        if (config.authToken) {
            config.headers = config.headers || {}
            config.headers.Authorization = `Bearer ${config.authToken}`
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
                message:
                    error.response.data?.message ||
                    error.response.data?.error ||
                    "Server error",
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
