import type { NextApiRequest, NextApiResponse } from "next";
import { registerUser } from "@/lib/auth/users";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  try {
    const { name, email, password } = req.body ?? {};
    const result = await registerUser(name, email, password);
    if (!result.ok) {
      return res.status(result.status).json(result);
    }
    return res.status(result.status).json(result);
  } catch {
    return res.status(500).json({
      ok: false,
      error: "Something went wrong while creating the account.",
    });
  }
}
