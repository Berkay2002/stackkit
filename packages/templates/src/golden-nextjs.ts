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
      `${root}/lib/auth-guard.ts`,
      "auth/auth0-nextjs",
      'import { AccessTokenError } from "@auth0/nextjs-auth0/errors";\nimport { redirect } from "next/navigation";\n\nimport { ApiError } from "./api";\nimport { auth0 } from "./auth0";\n\nconst loginUrl = "/auth/login?returnTo=/dashboard";\n\n/**\n * Runs an API call with the user\'s access token. A missing session, an access token that cannot be\n * refreshed, or an API 401 sends the user back through login instead of rendering an error page.\n */\nexport async function withApiAccessToken<T>(call: (token: string) => Promise<T>): Promise<T> {\n  if (!(await auth0.getSession())) redirect(loginUrl);\n  let token: string;\n  try {\n    token = (await auth0.getAccessToken()).token;\n  } catch (error) {\n    if (error instanceof AccessTokenError) redirect(loginUrl);\n    throw error;\n  }\n  try {\n    return await call(token);\n  } catch (error) {\n    if (error instanceof ApiError && error.status === 401) redirect(loginUrl);\n    throw error;\n  }\n}\n'
    ),
    writeFile(
      `${root}/lib/auth-guard.test.ts`,
      "auth/auth0-nextjs",
      'import { AccessTokenError } from "@auth0/nextjs-auth0/errors";\nimport { beforeEach, describe, expect, it, vi } from "vitest";\n\nimport { ApiError } from "./api";\nimport { withApiAccessToken } from "./auth-guard";\n\nconst mocks = vi.hoisted(() => ({\n  getSession: vi.fn(),\n  getAccessToken: vi.fn(),\n  redirect: vi.fn((url: string): never => {\n    throw new Error(`redirect:${url}`);\n  })\n}));\n\nvi.mock("./auth0", () => ({ auth0: { getSession: mocks.getSession, getAccessToken: mocks.getAccessToken } }));\nvi.mock("next/navigation", () => ({ redirect: mocks.redirect }));\n\nconst login = "redirect:/auth/login?returnTo=/dashboard";\n\nbeforeEach(() => {\n  vi.clearAllMocks();\n  mocks.getSession.mockResolvedValue({ user: { email: "user@example.com" } });\n  mocks.getAccessToken.mockResolvedValue({ token: "access-token" });\n});\n\ndescribe("withApiAccessToken", () => {\n  it("passes the access token to the API call", async () => {\n    await expect(withApiAccessToken(async (token) => token)).resolves.toBe("access-token");\n  });\n\n  it("redirects to login without a session", async () => {\n    mocks.getSession.mockResolvedValue(null);\n    await expect(withApiAccessToken(async () => "unreachable")).rejects.toThrow(login);\n  });\n\n  it("redirects to login when the access token cannot be refreshed", async () => {\n    mocks.getAccessToken.mockRejectedValue(new AccessTokenError("missing_refresh_token", "expired"));\n    await expect(withApiAccessToken(async () => "unreachable")).rejects.toThrow(login);\n  });\n\n  it("redirects to login when the API rejects the token", async () => {\n    await expect(withApiAccessToken(async () => { throw new ApiError(401, "unauthorized"); })).rejects.toThrow(login);\n  });\n\n  it("rethrows other API failures", async () => {\n    await expect(withApiAccessToken(async () => { throw new ApiError(500, "boom"); })).rejects.toMatchObject({ status: 500 });\n  });\n});\n'
    ),
    writeFile(
      `${root}/app/dashboard/actions.ts`,
      "auth/auth0-nextjs",
      '"use server";\n\nimport { revalidatePath } from "next/cache";\n\nimport { createTodo, deleteTodo, updateTodo } from "../../lib/api";\nimport { withApiAccessToken } from "../../lib/auth-guard";\n\nexport async function createTodoAction(formData: FormData) {\n  const title = String(formData.get("title") ?? "").trim();\n  if (!title) return;\n  await withApiAccessToken((token) => createTodo(token, title));\n  revalidatePath("/dashboard");\n}\n\nexport async function toggleTodoAction(formData: FormData) {\n  await withApiAccessToken((token) => updateTodo(token, Number(formData.get("id")), formData.get("completed") !== "true"));\n  revalidatePath("/dashboard");\n}\n\nexport async function deleteTodoAction(formData: FormData) {\n  await withApiAccessToken((token) => deleteTodo(token, Number(formData.get("id"))));\n  revalidatePath("/dashboard");\n}\n'
    ),
    writeFile(
      `${root}/app/dashboard/page.tsx`,
      "auth/auth0-nextjs",
      'import { listTodos } from "../../lib/api";\nimport { withApiAccessToken } from "../../lib/auth-guard";\nimport { createTodoAction, deleteTodoAction, toggleTodoAction } from "./actions";\n\nexport default async function DashboardPage() {\n  const todos = await withApiAccessToken(listTodos);\n\n  return (\n    <main>\n      <nav><a href="/">Home</a><a href="/auth/logout">Log out</a></nav>\n      <h1>Todos</h1>\n      <form action={createTodoAction}>\n        <input name="title" required maxLength={240} aria-label="Todo title" />\n        <button type="submit">Add todo</button>\n      </form>\n      <ul>\n        {todos.map((todo) => (\n          <li key={todo.id}>\n            <form action={toggleTodoAction}>\n              <input type="hidden" name="id" value={todo.id} />\n              <input type="hidden" name="completed" value={String(todo.completed)} />\n              <button type="submit">{todo.completed ? "Reopen" : "Complete"}</button>\n              <span>{todo.title}</span>\n            </form>\n            <form action={deleteTodoAction}><input type="hidden" name="id" value={todo.id} /><button type="submit">Delete</button></form>\n          </li>\n        ))}\n      </ul>\n    </main>\n  );\n}\n'
    )
  ];
}
