import type { FileOperation } from "@berkayorhan/stackkit-schemas";

import { writeFile } from "./file-operations.js";

export type GoldenFastApiOptions = {
  root: string;
  withSqlAlchemy: boolean;
  withAuth0: boolean;
};

export function goldenFastApiDependencies(options: Pick<GoldenFastApiOptions, "withSqlAlchemy" | "withAuth0">): string[] {
  return [
    "fastapi>=0.135,<1",
    "uvicorn[standard]>=0.41,<1",
    ...(options.withSqlAlchemy ? ["alembic>=1.19,<2", "psycopg[binary]>=3.3,<4", "sqlalchemy>=2.0,<3"] : []),
    ...(options.withAuth0 ? ["pyjwt[crypto]>=2.13,<3"] : [])
  ];
}

export function renderGoldenFastApiMain(options: Pick<GoldenFastApiOptions, "withSqlAlchemy" | "withAuth0">): string {
  const imports = options.withSqlAlchemy
    ? 'from fastapi import Depends, FastAPI, HTTPException\nfrom sqlalchemy import text\nfrom sqlalchemy.exc import SQLAlchemyError\nfrom sqlalchemy.orm import Session\n\nfrom app.database import get_session\nfrom app.routes import todos\n'
    : "from fastapi import FastAPI\n";
  const ready = options.withSqlAlchemy
    ? '\n@app.get("/ready")\ndef ready(session: Session = Depends(get_session)) -> dict[str, str]:\n    try:\n        session.execute(text("SELECT 1"))\n    except SQLAlchemyError as error:\n        raise HTTPException(status_code=503, detail="database unavailable") from error\n    return {"status": "ready"}\n'
    : '\n@app.get("/ready")\ndef ready() -> dict[str, str]:\n    return {"status": "ready"}\n';
  const router = options.withSqlAlchemy ? "\napp.include_router(todos.router)\n" : "";

  return `${imports}\napp = FastAPI(title="Stackkit API")\n\n@app.get("/health")\ndef health() -> dict[str, str]:\n    return {"status": "ok"}\n${ready}${router}`;
}

export function renderGoldenFastApiFiles(options: GoldenFastApiOptions): FileOperation[] {
  const files: FileOperation[] = [];

  if (options.withSqlAlchemy) {
    files.push(...renderSqlAlchemyFiles(options.root, options.withAuth0));
  }
  if (options.withAuth0) {
    files.push(...renderAuth0Files(options.root));
  }

  return files;
}

function renderSqlAlchemyFiles(root: string, withAuth0: boolean): FileOperation[] {
  const authImport = withAuth0 ? "from app.auth import get_current_user\n" : "";
  const authDependency = withAuth0 ? ", user: dict[str, Any] = Depends(get_current_user)" : "";
  const typingImport = withAuth0 ? "from typing import Any\n\n" : "";
  const ownerExpression = withAuth0 ? 'str(user["sub"])' : '"local"';

  return [
    writeFile(`${root}/app/__init__.py`, "api/fastapi", ""),
    writeFile(`${root}/app/routes/__init__.py`, "db/sqlalchemy", ""),
    writeFile(
      `${root}/app/database.py`,
      "db/sqlalchemy",
      'import os\nfrom collections.abc import Generator\n\nfrom sqlalchemy import create_engine\nfrom sqlalchemy.orm import DeclarativeBase, Session, sessionmaker\n\nDATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg://postgres:postgres@localhost:5432/app")\nengine = create_engine(DATABASE_URL, pool_pre_ping=True)\nSessionLocal = sessionmaker(bind=engine, expire_on_commit=False)\n\nclass Base(DeclarativeBase):\n    pass\n\ndef get_session() -> Generator[Session, None, None]:\n    with SessionLocal() as session:\n        yield session\n'
    ),
    writeFile(
      `${root}/app/models.py`,
      "db/sqlalchemy",
      'from datetime import datetime\n\nfrom sqlalchemy import Boolean, DateTime, String, func\nfrom sqlalchemy.orm import Mapped, mapped_column\n\nfrom app.database import Base\n\nclass Todo(Base):\n    __tablename__ = "todos"\n\n    id: Mapped[int] = mapped_column(primary_key=True)\n    owner_sub: Mapped[str] = mapped_column(String(255), index=True)\n    title: Mapped[str] = mapped_column(String(240))\n    completed: Mapped[bool] = mapped_column(Boolean, default=False)\n    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())\n'
    ),
    writeFile(
      `${root}/app/schemas.py`,
      "db/sqlalchemy",
      'from datetime import datetime\n\nfrom pydantic import BaseModel, ConfigDict, Field\n\nclass TodoCreate(BaseModel):\n    title: str = Field(min_length=1, max_length=240)\n\nclass TodoUpdate(BaseModel):\n    title: str | None = Field(default=None, min_length=1, max_length=240)\n    completed: bool | None = None\n\nclass TodoRead(BaseModel):\n    model_config = ConfigDict(from_attributes=True)\n\n    id: int\n    title: str\n    completed: bool\n    created_at: datetime\n'
    ),
    writeFile(
      `${root}/app/repository.py`,
      "db/sqlalchemy",
      'from sqlalchemy import select\nfrom sqlalchemy.orm import Session\n\nfrom app.models import Todo\nfrom app.schemas import TodoCreate, TodoUpdate\n\ndef list_todos(session: Session, owner_sub: str) -> list[Todo]:\n    return list(session.scalars(select(Todo).where(Todo.owner_sub == owner_sub).order_by(Todo.id)))\n\ndef create_todo(session: Session, data: TodoCreate, owner_sub: str) -> Todo:\n    todo = Todo(title=data.title, owner_sub=owner_sub)\n    session.add(todo)\n    session.commit()\n    session.refresh(todo)\n    return todo\n\ndef get_todo(session: Session, todo_id: int, owner_sub: str) -> Todo | None:\n    return session.scalar(select(Todo).where(Todo.id == todo_id, Todo.owner_sub == owner_sub))\n\ndef update_todo(session: Session, todo: Todo, data: TodoUpdate) -> Todo:\n    for field, value in data.model_dump(exclude_unset=True).items():\n        setattr(todo, field, value)\n    session.commit()\n    session.refresh(todo)\n    return todo\n\ndef delete_todo(session: Session, todo: Todo) -> None:\n    session.delete(todo)\n    session.commit()\n'
    ),
    writeFile(
      `${root}/app/routes/todos.py`,
      "db/sqlalchemy",
      `${typingImport}from fastapi import APIRouter, Depends, HTTPException, Response\nfrom sqlalchemy.orm import Session\n\n${authImport}from app.database import get_session\nfrom app import repository\nfrom app.schemas import TodoCreate, TodoRead, TodoUpdate\n\nrouter = APIRouter(prefix="/todos", tags=["todos"])\n\n@router.get("", response_model=list[TodoRead])\ndef list_todos(session: Session = Depends(get_session)${authDependency}) -> list[TodoRead]:\n    return [TodoRead.model_validate(todo) for todo in repository.list_todos(session, ${ownerExpression})]\n\n@router.post("", response_model=TodoRead, status_code=201)\ndef create_todo(data: TodoCreate, session: Session = Depends(get_session)${authDependency}) -> TodoRead:\n    return TodoRead.model_validate(repository.create_todo(session, data, ${ownerExpression}))\n\n@router.patch("/{todo_id}", response_model=TodoRead)\ndef update_todo(todo_id: int, data: TodoUpdate, session: Session = Depends(get_session)${authDependency}) -> TodoRead:\n    todo = repository.get_todo(session, todo_id, ${ownerExpression})\n    if todo is None:\n        raise HTTPException(status_code=404, detail="todo not found")\n    return TodoRead.model_validate(repository.update_todo(session, todo, data))\n\n@router.delete("/{todo_id}", status_code=204)\ndef delete_todo(todo_id: int, session: Session = Depends(get_session)${authDependency}) -> Response:\n    todo = repository.get_todo(session, todo_id, ${ownerExpression})\n    if todo is None:\n        raise HTTPException(status_code=404, detail="todo not found")\n    repository.delete_todo(session, todo)\n    return Response(status_code=204)\n`
    ),
    writeFile(
      `${root}/alembic.ini`,
      "db/sqlalchemy",
      '[alembic]\nscript_location = migrations\nprepend_sys_path = .\nsqlalchemy.url = postgresql+psycopg://postgres:postgres@localhost:5432/app\n\n[loggers]\nkeys = root,sqlalchemy,alembic\n[handlers]\nkeys = console\n[formatters]\nkeys = generic\n[logger_root]\nlevel = WARN\nhandlers = console\nqualname =\n[logger_sqlalchemy]\nlevel = WARN\nhandlers =\nqualname = sqlalchemy.engine\n[logger_alembic]\nlevel = INFO\nhandlers =\nqualname = alembic\n[handler_console]\nclass = StreamHandler\nargs = (sys.stderr,)\nlevel = NOTSET\nformatter = generic\n[formatter_generic]\nformat = %(levelname)-5.5s [%(name)s] %(message)s\n'
    ),
    writeFile(
      `${root}/migrations/env.py`,
      "db/sqlalchemy",
      'from logging.config import fileConfig\n\nfrom alembic import context\nfrom sqlalchemy import engine_from_config, pool\n\nfrom app.database import Base, DATABASE_URL\nfrom app import models  # noqa: F401\n\nconfig = context.config\nif config.config_file_name is not None:\n    fileConfig(config.config_file_name)\nconfig.set_main_option("sqlalchemy.url", DATABASE_URL)\ntarget_metadata = Base.metadata\n\ndef run_migrations_offline() -> None:\n    context.configure(url=config.get_main_option("sqlalchemy.url"), target_metadata=target_metadata, literal_binds=True)\n    with context.begin_transaction():\n        context.run_migrations()\n\ndef run_migrations_online() -> None:\n    connectable = engine_from_config(config.get_section(config.config_ini_section, {}), prefix="sqlalchemy.", poolclass=pool.NullPool)\n    with connectable.connect() as connection:\n        context.configure(connection=connection, target_metadata=target_metadata)\n        with context.begin_transaction():\n            context.run_migrations()\n\nif context.is_offline_mode():\n    run_migrations_offline()\nelse:\n    run_migrations_online()\n'
    ),
    writeFile(
      `${root}/migrations/script.py.mako`,
      "db/sqlalchemy",
      '"""${message}"""\nfrom alembic import op\nimport sqlalchemy as sa\n\nrevision = ${repr(up_revision)}\ndown_revision = ${repr(down_revision)}\nbranch_labels = ${repr(branch_labels)}\ndepends_on = ${repr(depends_on)}\n\ndef upgrade() -> None:\n    ${upgrades if upgrades else "pass"}\n\ndef downgrade() -> None:\n    ${downgrades if downgrades else "pass"}\n'
    ),
    writeFile(
      `${root}/migrations/versions/0001_create_todos.py`,
      "db/sqlalchemy",
      '"""create todos"""\nfrom alembic import op\nimport sqlalchemy as sa\n\nrevision = "0001"\ndown_revision = None\nbranch_labels = None\ndepends_on = None\n\ndef upgrade() -> None:\n    op.create_table("todos", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("owner_sub", sa.String(length=255), nullable=False), sa.Column("title", sa.String(length=240), nullable=False), sa.Column("completed", sa.Boolean(), nullable=False, server_default=sa.false()), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))\n    op.create_index("ix_todos_owner_sub", "todos", ["owner_sub"])\n\ndef downgrade() -> None:\n    op.drop_index("ix_todos_owner_sub", table_name="todos")\n    op.drop_table("todos")\n'
    ),
    writeFile(
      `${root}/tests/test_todos.py`,
      "db/sqlalchemy",
      `${withAuth0 ? "from app.auth import get_current_user\n" : ""}from collections.abc import Generator\n\nfrom app.database import Base, get_session\nfrom app.main import app\nfrom fastapi.testclient import TestClient\nfrom sqlalchemy import create_engine\nfrom sqlalchemy.orm import Session\nfrom sqlalchemy.pool import StaticPool\n\nengine = create_engine("sqlite+pysqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)\nBase.metadata.create_all(engine)\n\ndef session_override() -> Generator[Session, None, None]:\n    with Session(engine) as session:\n        yield session\n\napp.dependency_overrides[get_session] = session_override\n${withAuth0 ? 'current_user = {"sub": "test-user"}\napp.dependency_overrides[get_current_user] = lambda: current_user\n' : ""}client = TestClient(app)\n\ndef test_protected_todo_crud() -> None:\n    created = client.post("/todos", json={"title": "Ship Stackkit"})\n    assert created.status_code == 201\n    todo_id = created.json()["id"]\n    assert client.get("/todos").json()[0]["title"] == "Ship Stackkit"\n${withAuth0 ? '    current_user["sub"] = "another-user"\n    assert client.get("/todos").json() == []\n    assert client.patch(f"/todos/{todo_id}", json={"completed": True}).status_code == 404\n    current_user["sub"] = "test-user"\n' : ""}    assert client.patch(f"/todos/{todo_id}", json={"completed": True}).json()["completed"] is True\n    assert client.delete(f"/todos/{todo_id}").status_code == 204\n`
    )
  ];
}

function renderAuth0Files(root: string): FileOperation[] {
  return [
    writeFile(
      `${root}/app/auth.py`,
      "auth/auth0-fastapi",
      'import os\nfrom functools import lru_cache\nfrom typing import Any, Protocol\n\nimport jwt\nfrom fastapi import Depends, HTTPException\nfrom fastapi.security import HTTPAuthorizationCredentials, HTTPBearer\n\nclass SigningKey(Protocol):\n    key: Any\n\nclass JwkClient(Protocol):\n    def get_signing_key_from_jwt(self, token: str) -> SigningKey: ...\n\nclass TokenVerifier:\n    def __init__(self, domain: str, audience: str, jwk_client: JwkClient | None = None, issuer: str | None = None, jwks_url: str | None = None) -> None:\n        self.issuer = issuer or f"https://{domain.rstrip(\'/\')}/"\n        self.audience = audience\n        self.jwk_client = jwk_client or jwt.PyJWKClient(jwks_url or f"{self.issuer}.well-known/jwks.json", cache_jwk_set=True, lifespan=300)\n\n    def verify(self, token: str) -> dict[str, Any]:\n        signing_key = self.jwk_client.get_signing_key_from_jwt(token)\n        return jwt.decode(token, signing_key.key, algorithms=["RS256"], audience=self.audience, issuer=self.issuer)\n\n@lru_cache\ndef token_verifier() -> TokenVerifier:\n    domain = os.environ.get("AUTH0_DOMAIN")\n    audience = os.environ.get("AUTH0_AUDIENCE")\n    if not domain or not audience:\n        raise RuntimeError("AUTH0_DOMAIN and AUTH0_AUDIENCE are required")\n    return TokenVerifier(domain, audience, issuer=os.environ.get("AUTH0_ISSUER"), jwks_url=os.environ.get("AUTH0_JWKS_URL"))\n\nsecurity = HTTPBearer(auto_error=False)\n\ndef get_current_user(credentials: HTTPAuthorizationCredentials | None = Depends(security)) -> dict[str, Any]:\n    if credentials is None:\n        raise HTTPException(status_code=401, detail="missing bearer token")\n    try:\n        return token_verifier().verify(credentials.credentials)\n    except jwt.PyJWTError as error:\n        raise HTTPException(status_code=401, detail="invalid access token") from error\n'
    ),
    writeFile(
      `${root}/tests/test_auth.py`,
      "auth/auth0-fastapi",
      'from datetime import UTC, datetime, timedelta\nfrom typing import Any\n\nimport jwt\nimport pytest\nfrom cryptography.hazmat.primitives.asymmetric import rsa\nfrom fastapi import HTTPException\n\nfrom app.auth import TokenVerifier, get_current_user\n\nclass FakeSigningKey:\n    def __init__(self, key: Any) -> None:\n        self.key = key\n\nclass FakeJwkClient:\n    def __init__(self, key: Any) -> None:\n        self.key = key\n\n    def get_signing_key_from_jwt(self, token: str) -> FakeSigningKey:\n        return FakeSigningKey(self.key)\n\ndef test_mock_jwks_verifies_an_auth0_access_token() -> None:\n    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)\n    now = datetime.now(UTC)\n    token = jwt.encode({"sub": "auth0|test", "iss": "https://example.auth0.com/", "aud": "https://api.example", "iat": now, "exp": now + timedelta(minutes=5)}, private_key, algorithm="RS256", headers={"kid": "test"})\n    verifier = TokenVerifier("example.auth0.com", "https://api.example", FakeJwkClient(private_key.public_key()))\n    assert verifier.verify(token)["sub"] == "auth0|test"\n\ndef test_missing_bearer_token_is_unauthorized() -> None:\n    with pytest.raises(HTTPException) as error:\n        get_current_user(None)\n    assert error.value.status_code == 401\n'
    )
  ];
}
