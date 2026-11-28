import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://oshzolylugwysxszuyur.supabase.co";
const SUPABASE_KEY = "sb_publishable_TU-c-2N4UxAuzCmdg6k1kw_x_Zkqqt4";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export function getUserKey(): string {
  const key = "murajaah_device_key";
  let id = localStorage.getItem(key);
  if (!id) {
    id = "dev_" + crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}