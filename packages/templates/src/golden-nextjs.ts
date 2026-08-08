import type { FileOperation } from "@berkayorhan/stackkit-schemas";

import { writeFile } from "./file-operations.js";

export function renderAuth0HomePage(): string {
  return 'import { auth0 } from "../lib/auth0";\n\nexport default async function Page() {\n  const session = await auth0.getSession();\n\n  return (\n    <main>\n      <h1>Stackkit Todos</h1>\n      {session ? (\n        <nav>\n          <span>Signed in as {session.user.name ?? session.user.email}</span>\n          <a href="/dashboard">Open dashboard</a>\n          <a href="/auth/logout">Log out</a>\n        </nav>\n      ) : (\n        <nav>\n          <a href="/auth/login">Log in</a>\n          <a href="/auth/login?screen_hint=signup">Sign up</a>\n        </nav>\n      )}\n    </main>\n  );\n}\n';
}

export function renderAuth0NextjsFiles(root: string, withTodoApi: boolean): FileOperation[] {
  const files = [
    writeFile(
      `${root}/lib/auth0.ts`,
      "auth/auth0-nextjs",
      'import { Auth0Client } from "@auth0/nextjs-auth0/server";\n\nexport const auth0 = new Auth0Client({\n  authorizationParameters: {\n    audience: process.env.AUTH0_AUDIENCE\n  },\n  allowInsecureRequests: process.env.AUTH0_ALLOW_INSECURE_REQUESTS === "true",\n  enableAccessTokenEndpoint: false\n});\n'
    ),
    writeFile(
      `${root}/proxy.ts`,
      "auth/auth0-nextjs",
      'import { auth0 } from "./lib/auth0";\n\nexport async function proxy(request: Request) {\n  return await auth0.middleware(request);\n}\n\nexport const config = {\n  matcher: ["/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"]\n};\n'
    ),
    writeFile(
      `${root}/lib/auth-guard.ts`,
      "auth/auth0-nextjs",
      'export type SessionLike = { user: { name?: string | null; email?: string | null }; accessToken?: string } | null;\n\nexport class AuthenticationRequiredError extends Error {\n  constructor() {\n    super("Authentication required");\n    this.name = "AuthenticationRequiredError";\n  }\n}\n\nexport function requireSession<T extends SessionLike>(session: T): Exclude<T, null> {\n  if (!session) throw new AuthenticationRequiredError();\n  return session as Exclude<T, null>;\n}\n'
    ),
    writeFile(
      `${root}/lib/auth-guard.test.ts`,
      "auth/auth0-nextjs",
      'import { describe, expect, it } from "vitest";\n\nimport { AuthenticationRequiredError, requireSession } from "./auth-guard";\n\ndescribe("requireSession", () => {\n  it("rejects anonymous access", () => {\n    expect(() => requireSession(null)).toThrow(AuthenticationRequiredError);\n  });\n\n  it("returns an authenticated session", () => {\n    const session = { user: { email: "user@example.com" }, accessToken: "token" };\n    expect(requireSession(session)).toBe(session);\n  });\n});\n'
    )
  ];

  if (withTodoApi) {
    files.push(...renderTodoWebFiles(root));
  }

  return files;
}

function renderTodoWebFiles(root: string): FileOperation[] {
  return [
    writeFile(
      `${root}/lib/api.ts`,
      "auth/auth0-nextjs",
      'export type Todo = { id: number; title: string; completed: boolean; created_at: string };\n\nexport class ApiError extends Error {\n  constructor(public readonly status: number, message: string) {\n    super(message);\n    this.name = "ApiError";\n  }\n}\n\nconst apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:8000";\n\nasync function apiRequest<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {\n  const response = await fetch(`${apiBaseUrl}${path}`, {\n    ...init,\n    cache: "no-store",\n    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}`, ...init?.headers }\n  });\n  if (!response.ok) {\n    const message = response.status === 401 ? "Your session is no longer authorized" : `API request failed (${response.status})`;\n    throw new ApiError(response.status, message);\n  }\n  if (response.status === 204) return undefined as T;\n  return (await response.json()) as T;\n}\n\nexport const listTodos = (token: string) => apiRequest<Todo[]>("/todos", token);\nexport const createTodo = (token: string, title: string) => apiRequest<Todo>("/todos", token, { method: "POST", body: JSON.stringify({ title }) });\nexport const updateTodo = (token: string, id: number, completed: boolean) => apiRequest<Todo>(`/todos/${id}`, token, { method: "PATCH", body: JSON.stringify({ completed }) });\nexport const deleteTodo = (token: string, id: number) => apiRequest<void>(`/todos/${id}`, token, { method: "DELETE" });\n'
    ),
    writeFile(
      `${root}/lib/api.test.ts`,
      "auth/auth0-nextjs",
      'import { afterEach, describe, expect, it, vi } from "vitest";\n\nimport { listTodos } from "./api";\n\nafterEach(() => vi.unstubAllGlobals());\n\ndescribe("API client", () => {\n  it("forwards the access token", async () => {\n    const fetchMock = vi.fn(async () => new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }));\n    vi.stubGlobal("fetch", fetchMock);\n    await listTodos("access-token");\n    expect(fetchMock).toHaveBeenCalledWith("http://localhost:8000/todos", expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer access-token" }) }));\n  });\n\n  it("returns a typed unauthorized error", async () => {\n    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 401 })));\n    await expect(listTodos("expired")).rejects.toMatchObject({ name: "ApiError", status: 401, message: "Your session is no longer authorized" });\n  });\n});\n'
    ),
    writeFile(
      `${root}/app/dashboard/actions.ts`,
      "auth/auth0-nextjs",
      '"use server";\n\nimport { revalidatePath } from "next/cache";\nimport { redirect } from "next/navigation";\n\nimport { auth0 } from "../../lib/auth0";\nimport { createTodo, deleteTodo, updateTodo } from "../../lib/api";\n\nasync function accessToken(): Promise<string> {\n  const session = await auth0.getSession();\n  if (!session) redirect("/auth/login");\n  return (await auth0.getAccessToken()).token;\n}\n\nexport async function createTodoAction(formData: FormData) {\n  const title = String(formData.get("title") ?? "").trim();\n  if (!title) return;\n  await createTodo(await accessToken(), title);\n  revalidatePath("/dashboard");\n}\n\nexport async function toggleTodoAction(formData: FormData) {\n  await updateTodo(await accessToken(), Number(formData.get("id")), formData.get("completed") !== "true");\n  revalidatePath("/dashboard");\n}\n\nexport async function deleteTodoAction(formData: FormData) {\n  await deleteTodo(await accessToken(), Number(formData.get("id")));\n  revalidatePath("/dashboard");\n}\n'
    ),
    writeFile(
      `${root}/app/dashboard/page.tsx`,
      "auth/auth0-nextjs",
      'import { redirect } from "next/navigation";\n\nimport { auth0 } from "../../lib/auth0";\nimport { listTodos } from "../../lib/api";\nimport { createTodoAction, deleteTodoAction, toggleTodoAction } from "./actions";\n\nexport default async function DashboardPage() {\n  const session = await auth0.getSession();\n  if (!session) redirect("/auth/login");\n  const { token } = await auth0.getAccessToken();\n  const todos = await listTodos(token);\n\n  return (\n    <main>\n      <nav><a href="/">Home</a><a href="/auth/logout">Log out</a></nav>\n      <h1>Todos</h1>\n      <form action={createTodoAction}>\n        <input name="title" required maxLength={240} aria-label="Todo title" />\n        <button type="submit">Add todo</button>\n      </form>\n      <ul>\n        {todos.map((todo) => (\n          <li key={todo.id}>\n            <form action={toggleTodoAction}>\n              <input type="hidden" name="id" value={todo.id} />\n              <input type="hidden" name="completed" value={String(todo.completed)} />\n              <button type="submit">{todo.completed ? "Reopen" : "Complete"}</button>\n              <span>{todo.title}</span>\n            </form>\n            <form action={deleteTodoAction}><input type="hidden" name="id" value={todo.id} /><button type="submit">Delete</button></form>\n          </li>\n        ))}\n      </ul>\n    </main>\n  );\n}\n'
    )
  ];
}
