import { http, HttpResponse } from "msw";
import { demoSession, registerSession } from "../fixtures/auth";

export const authHandlers = [
  http.post("/api/auth/login", () => HttpResponse.json(demoSession)),

  http.post("/api/auth/register", () => HttpResponse.json(registerSession, { status: 201 })),

  http.post("/api/auth/refresh", () => new HttpResponse(null, { status: 204 })),

  http.post("/api/auth/logout", () => new HttpResponse(null, { status: 204 })),

  http.get("/api/auth/session", () => HttpResponse.json(demoSession)),
];
