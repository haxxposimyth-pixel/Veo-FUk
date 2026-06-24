CREATE INDEX IF NOT EXISTS idx_veo_prompts_project_num 
ON veo_prompts(project_id, prompt_number);
