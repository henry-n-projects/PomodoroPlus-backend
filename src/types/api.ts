import type { Prisma } from "@prisma/client";

export interface UserObject {
  id: string;
  auth_user_id: string;
  name: string;
  avatar_url?: string | null;
  timezone: string;
  settings: Prisma.JsonValue;
}

// Client response bodys
export interface CreateUpcomingBody {
  name?: string;
  start_at: string;
  end_at?: string | null;
  tag_id?: string;
  new_tag_name?: string;
  new_tag_color?: string;
}

export interface UpdateUpcomingBody {
  name?: string;
  start_at?: string;
  end_at: null;
  tag_id?: string;
}

export interface CreateDistractionBody {
  session_id: string;
  name: string;
}
