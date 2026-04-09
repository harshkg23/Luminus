from __future__ import annotations

import logging
import os
from typing import Any

logger = logging.getLogger(__name__)


def get_similar_past_fixes(
    git_diff: str,
    changed_files: list,
    failed_tests: list,
    top_k: int = 3,
) -> list[dict]:
    """Retrieve similar past healer fixes from MongoDB Atlas Vector Search."""
    mongodb_uri = os.getenv("MONGODB_URI", "")
    openai_key = os.getenv("OPENAI_API_KEY", "")

    if not mongodb_uri or not openai_key:
        logger.warning("get_similar_past_fixes: MONGODB_URI or OPENAI_API_KEY not set — returning empty.")
        return []

    try:
        from langchain_openai import OpenAIEmbeddings
        import pymongo

        error_snippets = [
            item.get("error", "") for item in (failed_tests or [])[:3]
        ]
        query_text = "\n".join([
            git_diff,
            str(changed_files),
            *error_snippets,
        ])

        embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
        query_vector = embeddings.embed_query(query_text)

        client = pymongo.MongoClient(mongodb_uri)
        collection = client["tollgate"]["healer_memory"]

        pipeline = [
            {
                "$vectorSearch": {
                    "index": "healer_vector_index",
                    "path": "embedding",
                    "queryVector": query_vector,
                    "numCandidates": 50,
                    "limit": top_k,
                }
            }
        ]

        results = list(collection.aggregate(pipeline))
        
        # Deduplicate by session_id in case chunked documents were stored
        unique_results = []
        seen = set()
        for r in results:
            sid = r.get("session_id")
            if sid and sid in seen:
                continue
            if sid:
                seen.add(sid)
            unique_results.append(r)
            
        logger.info("get_similar_past_fixes: retrieved %d unique similar fix(es).", len(unique_results))
        return unique_results

    except Exception as exc:
        logger.warning("get_similar_past_fixes: failed — %s: %s", exc.__class__.__name__, exc)
        return []


def get_similar_past_test_plans(
    changed_files: list[str],
    git_diff: str,
    top_k: int = 2,
) -> list[dict[str, Any]]:
    """Retrieve similar past test plans for the architect from MongoDB Atlas Vector Search."""
    mongodb_uri = os.getenv("MONGODB_URI", "")
    openai_key = os.getenv("OPENAI_API_KEY", "")

    if not mongodb_uri or not openai_key:
        logger.warning("get_similar_past_test_plans: MONGODB_URI or OPENAI_API_KEY not set — returning empty.")
        return []

    try:
        from langchain_openai import OpenAIEmbeddings
        import pymongo

        query_text = "\n".join([
            str(changed_files),
            git_diff[:3000],
        ])

        embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
        query_vector = embeddings.embed_query(query_text)

        client = pymongo.MongoClient(mongodb_uri)
        collection = client["tollgate"]["architect_memory"]

        pipeline = [
            {
                "$vectorSearch": {
                    "index": "architect_vector_index",
                    "path": "embedding",
                    "queryVector": query_vector,
                    "numCandidates": 30,
                    "limit": top_k,
                }
            }
        ]

        results = list(collection.aggregate(pipeline))
        
        unique_results = []
        seen = set()
        for r in results:
            sid = r.get("session_id")
            if sid and sid in seen:
                continue
            if sid:
                seen.add(sid)
            unique_results.append(r)
            
        logger.info("get_similar_past_test_plans: retrieved %d unique plan(s).", len(unique_results))
        return unique_results

    except Exception as exc:
        logger.warning("get_similar_past_test_plans: failed — %s: %s", exc.__class__.__name__, exc)
        return []
