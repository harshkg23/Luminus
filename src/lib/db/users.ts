import { ObjectId, type Collection } from "mongodb";
import clientPromise from "@/lib/mongodb";

export interface DBUser {
  _id?: ObjectId;
  name: string | null;
  email: string;
  emailVerified: Date | null;
  image: string | null;
  password?: string;
  provider?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicUser {
  id: string;
  name: string | null;
  email: string;
  emailVerified: Date | null;
  image: string | null;
  provider?: string;
  createdAt: Date;
}

async function col(): Promise<Collection<DBUser>> {
  const client = await clientPromise;
  return client.db().collection<DBUser>("users");
}

export async function findUserByEmail(email: string): Promise<DBUser | null> {
  const users = await col();
  return users.findOne({ email: email.toLowerCase() });
}

export async function findUserById(id: string): Promise<DBUser | null> {
  const users = await col();
  try {
    return users.findOne({ _id: new ObjectId(id) });
  } catch {
    return null;
  }
}

export async function createUser(data: {
  name: string;
  email: string;
  password: string;
}): Promise<DBUser> {
  const users = await col();
  const now = new Date();

  const newUser: DBUser = {
    name: data.name,
    email: data.email.toLowerCase(),
    emailVerified: null,
    image: null,
    password: data.password,
    provider: "credentials",
    createdAt: now,
    updatedAt: now,
  };

  const result = await users.insertOne(newUser);
  return { ...newUser, _id: result.insertedId };
}

export async function updateUser(
  id: string,
  data: Partial<Pick<DBUser, "name" | "image">>,
): Promise<DBUser | null> {
  const users = await col();
  try {
    return users.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { ...data, updatedAt: new Date() } },
      { returnDocument: "after" },
    );
  } catch {
    return null;
  }
}

export async function deleteUserById(id: string): Promise<boolean> {
  const users = await col();
  try {
    const result = await users.deleteOne({ _id: new ObjectId(id) });
    return result.deletedCount === 1;
  } catch {
    return false;
  }
}

export function sanitizeUser(user: DBUser): PublicUser {
  return {
    id: user._id!.toString(),
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    image: user.image,
    provider: user.provider,
    createdAt: user.createdAt,
  };
}
