"""Which project a request is for, and whether the signed-in account may open it.

Project pages send the project id in the `X-Mula-Project` header (the Next.js proxy sets it from
the page URL, /projects/<id>/...). Every project route depends on `current_project` instead of
`current_account`, so no project data is read or written without a membership check. A project the
account isn't a member of answers 404, the same as one that doesn't exist.
"""
from fastapi import Depends, Header, HTTPException

from ..auth import accounts
from . import service

HEADER = "X-Mula-Project"


def current_project(account: dict = Depends(accounts.current_account),
                    x_mula_project: str | None = Header(default=None, alias=HEADER)):
    if not x_mula_project:
        raise HTTPException(400, "Open a project first.")
    row = service.member_project(account["id"], x_mula_project)
    if row is None:
        raise HTTPException(404, "This project was not found.")
    return {
        "id": row["id"],
        "name": row["name"],
        "display_name": row["name"] or service.UNTITLED,
        "conversation_id": row["conversation_id"],
        "role": row["role"],
        "account_id": account["id"],
        "username": account["username"],
    }
