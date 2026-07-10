export interface User {
  id: number;
  username?: string;
  first_name?: string;
  created_at?: Date | string;
}

export interface Session {
  id_session: string;
  user_id: number;
  status: 'active' | 'finished';
  created_at?: Date | string;
  updated_at?: Date | string;
}

export interface Message {
  id?: number;
  session_id: string;
  sender: 'user' | 'bot';
  content: string;
  created_at?: Date | string;
}

export interface Rating {
  id?: number;
  session_id: string;
  score: number;
  created_at?: Date | string;
}

export interface Knowledge {
  id?: number;
  reference_id?: string;
  dataset_target?: string;
  type?: string;
  data: any; // JSONB
  is_active?: boolean;
  created_at?: Date | string;
  updated_at?: Date | string;
}
