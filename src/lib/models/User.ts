import mongoose, { Schema, model, models } from "mongoose";

export interface IUser {
  _id: mongoose.Types.ObjectId;
  name: string;
  email: string;
  password?: string;       // only for credentials users
  image?: string;
  provider?: string;       // "github" | "google" | "gitlab" | "credentials"
  createdAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name:     { type: String, required: true },
    email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String },
    image:    { type: String },
    provider: { type: String, default: "credentials" },
  },
  { timestamps: true }
);

export const User = models.User ?? model<IUser>("User", UserSchema);
