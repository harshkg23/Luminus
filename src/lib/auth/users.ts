import bcrypt from "bcryptjs";
import {
  findUserByEmail,
  findUserById,
  createUser,
  updateUser,
  deleteUserById,
  sanitizeUser,
  type PublicUser,
} from "@/lib/db/users";

export type SuccessResult<T = void> = {
  ok: true;
  status: 200 | 201;
  data: T;
};

export type ErrorResult = {
  ok: false;
  status: 400 | 401 | 404 | 409 | 500;
  error: string;
};

export type Result<T = void> = SuccessResult<T> | ErrorResult;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function registerUser(
  name: unknown,
  email: unknown,
  password: unknown,
): Promise<Result<{ message: string }>> {
  if (
    typeof name !== "string" ||
    typeof email !== "string" ||
    typeof password !== "string"
  ) {
    return { ok: false, status: 400, error: "Invalid request body." };
  }

  const trimmedName = name.trim();
  const trimmedEmail = email.trim().toLowerCase();

  if (!trimmedName || !trimmedEmail || !password) {
    return {
      ok: false,
      status: 400,
      error: "Name, email, and password are required.",
    };
  }

  if (!EMAIL_RE.test(trimmedEmail)) {
    return {
      ok: false,
      status: 400,
      error: "Please enter a valid email address.",
    };
  }

  if (password.length < 8) {
    return {
      ok: false,
      status: 400,
      error: "Password must be at least 8 characters.",
    };
  }

  const existing = await findUserByEmail(trimmedEmail);
  if (existing) {
    return {
      ok: false,
      status: 409,
      error: "An account with this email already exists.",
    };
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  await createUser({
    name: trimmedName,
    email: trimmedEmail,
    password: hashedPassword,
  });

  return {
    ok: true,
    status: 201,
    data: { message: "Account created successfully." },
  };
}

export async function verifyCredentials(
  email: string,
  password: string,
): Promise<{ id: string; name: string | null; email: string; image: string | null } | null> {
  if (!email || !password) return null;

  const user = await findUserByEmail(email.toLowerCase());
  if (!user || !user.password) return null;

  const match = await bcrypt.compare(password, user.password);
  if (!match) return null;

  return {
    id: user._id!.toString(),
    name: user.name,
    email: user.email,
    image: user.image ?? null,
  };
}

export async function getMe(userId: string): Promise<Result<PublicUser>> {
  const user = await findUserById(userId);
  if (!user) {
    return { ok: false, status: 404, error: "User not found." };
  }
  return { ok: true, status: 200, data: sanitizeUser(user) };
}

export async function updateProfile(
  userId: string,
  body: unknown,
): Promise<Result<PublicUser>> {
  if (typeof body !== "object" || body === null) {
    return { ok: false, status: 400, error: "Invalid request body." };
  }

  const { name, image } = body as Record<string, unknown>;
  const patch: { name?: string; image?: string } = {};

  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) {
      return { ok: false, status: 400, error: "Name must be a non-empty string." };
    }
    patch.name = name.trim();
  }

  if (image !== undefined) {
    if (typeof image !== "string") {
      return { ok: false, status: 400, error: "Image must be a URL string." };
    }
    patch.image = image;
  }

  if (Object.keys(patch).length === 0) {
    return {
      ok: false,
      status: 400,
      error: "Provide at least one field to update (name, image).",
    };
  }

  const updated = await updateUser(userId, patch);
  if (!updated) {
    return { ok: false, status: 404, error: "User not found." };
  }

  return { ok: true, status: 200, data: sanitizeUser(updated) };
}

export async function deleteAccount(userId: string): Promise<Result<{ message: string }>> {
  const deleted = await deleteUserById(userId);
  if (!deleted) {
    return { ok: false, status: 404, error: "User not found or already deleted." };
  }
  return { ok: true, status: 200, data: { message: "Account deleted successfully." } };
}
