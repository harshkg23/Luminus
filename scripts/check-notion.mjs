import { readFileSync } from "fs";
import { Client } from "@notionhq/client";

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter(l => l.trim().length > 0 && l.includes("=") && !l.startsWith("#"))
    .map(l => {
      const idx = l.indexOf("=");
      const k = l.slice(0, idx).trim();
      const v = l.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
      return [k, v];
    })
);

const token = env.NOTION_TOKEN;
const dbId = env.NOTION_DATABASE_ID;

if (!token || !dbId) {
  console.error("NOTION_TOKEN or NOTION_DATABASE_ID missing from .env");
  process.exit(1);
}

const notion = new Client({ auth: token });

console.log("Fetching Notion database schema...\n");
try {
  const db = await notion.databases.retrieve({ database_id: dbId });
  const props = Object.entries(db.properties).map(([name, val]) => ({
    name,
    type: val.type,
  }));
  console.log("Database:", db.title?.[0]?.plain_text ?? "(no title)");
  console.log("\nProperties:");
  props.forEach(p => console.log(`  • "${p.name}" (${p.type})`));
} catch (e) {
  console.error("Error:", e.message);
}
