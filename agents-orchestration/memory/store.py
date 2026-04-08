from __future__ import annotations

import datetime
import logging
import os
from typing import Any

from graph.state import SentinelState

logger = logging.getLogger(__name__)


def store_successful_fix(state: SentinelState) -> None:
    """Store a successful healer fix in the vector DB for RAG retrieval."""
    mongodb_uri = os.getenv("MONGODB_URI", "")
    openai_key = os.getenv("OPENAI_API_KEY", "")

    if not mongodb_uri or not openai_key:
        logger.warning("store_successful_fix: MONGODB_URI or OPENAI_API_KEY not set — skipping.")
        return

    try:
        from langchain_openai import OpenAIEmbeddings
        import pymongo

        text = "\n".join([
            str(state.get("rca_type", "")),
            str(state.get("rca_report", "")),
            str(state.get("git_diff", "")),
            str(state.get("changed_files", [])),
        ])

        embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
        embedding_vector = embeddings.embed_documents([text])[0]

        client = pymongo.MongoClient(mongodb_uri)
        collection = client["tollgate"]["healer_memory"]

        doc = {
            "embedding": embedding_vector,
            "rca_type": str(state.get("rca_type", "")),
            "rca_report": str(state.get("rca_report", "")),
            "proposed_fix": str(state.get("proposed_fix", "")),
            "proposed_patch": str(state.get("proposed_patch", "")),
            "file_edits": state.get("file_edits", []),
            "target_files": state.get("target_files", []),
            "fix_branch": str(state.get("fix_branch", "")),
            "confidence_score": float(state.get("confidence_score", 0.0)),
            "repo_url": str(state.get("repo_url", "")),
            "created_at": datetime.datetime.utcnow(),
        }

        collection.insert_one(doc)
        logger.info("store_successful_fix: stored fix rca_type=%s repo=%s", doc["rca_type"], doc["repo_url"])

    except Exception as exc:
        logger.error("store_successful_fix: failed — %s: %s", exc.__class__.__name__, exc)


def store_fix_from_api(data: dict[str, Any]) -> bool:
    """Store a fix from the Next.js orchestrator (called via /store-fix endpoint).

    Accepts a flat dict with healer results, test results, and test plan info.
    Returns True if stored successfully.
    """
    mongodb_uri = os.getenv("MONGODB_URI", "")
    openai_key = os.getenv("OPENAI_API_KEY", "")

    if not mongodb_uri or not openai_key:
        logger.warning("store_fix_from_api: MONGODB_URI or OPENAI_API_KEY not set — skipping.")
        return False

    try:
        from langchain_openai import OpenAIEmbeddings
        import pymongo

        # Build embedding text from the most relevant fields
        text_parts = [
            data.get("rca_type", ""),
            data.get("rca_report", ""),
            data.get("proposed_fix", ""),
            data.get("git_diff", ""),
            str(data.get("changed_files", [])),
        ]
        # Include error messages from failed tests for better similarity matching
        for tr in (data.get("failed_tests", []) or [])[:5]:
            if isinstance(tr, dict):
                text_parts.append(tr.get("error", ""))
                text_parts.append(tr.get("name", ""))

        text = "\n".join(filter(None, text_parts))

        embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
        embedding_vector = embeddings.embed_documents([text])[0]

        client = pymongo.MongoClient(mongodb_uri)
        collection = client["tollgate"]["healer_memory"]

        doc = {
            "embedding": embedding_vector,
            "rca_type": data.get("rca_type", ""),
            "rca_report": data.get("rca_report", ""),
            "proposed_fix": data.get("proposed_fix", ""),
            "proposed_patch": data.get("proposed_patch", ""),
            "file_edits": data.get("file_edits", []),
            "target_files": data.get("target_files", []),
            "fix_branch": data.get("fix_branch", ""),
            "confidence_score": float(data.get("confidence_score", 0.0)),
            "repo_url": data.get("repo_url", ""),
            "changed_files": data.get("changed_files", []),
            "test_plan": data.get("test_plan", ""),
            "test_results_summary": {
                "total": data.get("total_tests", 0),
                "passed": data.get("passed_tests", 0),
                "failed": data.get("failed_tests_count", 0),
            },
            "failed_test_errors": [
                {"name": t.get("name", ""), "error": t.get("error", "")}
                for t in (data.get("failed_tests", []) or [])[:10]
                if isinstance(t, dict)
            ],
            "pr_url": data.get("pr_url", ""),
            "pr_number": data.get("pr_number"),
            "session_id": data.get("session_id", ""),
            "created_at": datetime.datetime.utcnow(),
        }

        collection.insert_one(doc)
        logger.info(
            "store_fix_from_api: stored fix session=%s rca=%s repo=%s",
            doc["session_id"], doc["rca_type"], doc["repo_url"],
        )
        return True

    except Exception as exc:
        logger.error("store_fix_from_api: failed — %s: %s", exc.__class__.__name__, exc)
        return False


def store_test_plan(data: dict[str, Any]) -> bool:
    """Store a generated test plan for architect RAG retrieval."""
    mongodb_uri = os.getenv("MONGODB_URI", "")
    openai_key = os.getenv("OPENAI_API_KEY", "")

    if not mongodb_uri or not openai_key:
        logger.warning("store_test_plan: MONGODB_URI or OPENAI_API_KEY not set — skipping.")
        return False

    try:
        from langchain_openai import OpenAIEmbeddings
        import pymongo

        text = "\n".join(filter(None, [
            str(data.get("changed_files", [])),
            data.get("git_diff", "")[:3000],
            data.get("test_plan", ""),
        ]))

        embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
        embedding_vector = embeddings.embed_documents([text])[0]

        client = pymongo.MongoClient(mongodb_uri)
        collection = client["tollgate"]["architect_memory"]

        doc = {
            "embedding": embedding_vector,
            "test_plan": data.get("test_plan", ""),
            "changed_files": data.get("changed_files", []),
            "repo_url": data.get("repo_url", ""),
            "total_tests": data.get("total_tests", 0),
            "passed_tests": data.get("passed_tests", 0),
            "session_id": data.get("session_id", ""),
            "created_at": datetime.datetime.utcnow(),
        }

        collection.insert_one(doc)
        logger.info("store_test_plan: stored plan session=%s repo=%s", doc["session_id"], doc["repo_url"])
        return True

    except Exception as exc:
        logger.error("store_test_plan: failed — %s: %s", exc.__class__.__name__, exc)
        return False
