import { redirect } from "next/navigation";

// "My team" became "My agents"; keep old links and bookmarks working.
export default function Page() {
  redirect("/agents");
}
