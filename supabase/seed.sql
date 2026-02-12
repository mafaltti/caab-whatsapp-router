-- Seed data for local development and testing
-- 3 users with different session states

-- User 1: Active session in digital_certificate > purchase > ask_cpf
INSERT INTO conversation_state (user_id, instance, active_flow, active_subroute, step, data, updated_at, expires_at)
VALUES (
  '5511999990001',
  'main-instance',
  'digital_certificate',
  'purchase',
  'ask_cpf',
  '{"person_type": "PF"}'::jsonb,
  now(),
  now() + interval '30 minutes'
);

-- User 2: Active session in billing > ask_invoice_id
INSERT INTO conversation_state (user_id, instance, active_flow, active_subroute, step, data, updated_at, expires_at)
VALUES (
  '5511999990002',
  'main-instance',
  'billing',
  NULL,
  'ask_invoice_id',
  '{}'::jsonb,
  now(),
  now() + interval '30 minutes'
);

-- User 3: Expired session (expires_at in the past) for testing expiry detection
INSERT INTO conversation_state (user_id, instance, active_flow, active_subroute, step, data, updated_at, expires_at)
VALUES (
  '5511999990003',
  'main-instance',
  'digital_certificate',
  'support',
  'ask_issue',
  '{"email": "expired@test.com"}'::jsonb,
  now() - interval '1 hour',
  now() - interval '30 minutes'
);

-- Chat messages for User 1 (5 messages for LLM context testing)
INSERT INTO chat_messages (user_id, instance, direction, message_id, text, created_at) VALUES
  ('5511999990001', 'main-instance', 'in',  'MSG_SEED_001', 'Oi, preciso de um certificado digital', now() - interval '10 minutes'),
  ('5511999990001', 'main-instance', 'out', NULL,           'Olá! Vou te ajudar com seu certificado digital. Você deseja comprar, renovar ou precisa de suporte?', now() - interval '9 minutes'),
  ('5511999990001', 'main-instance', 'in',  'MSG_SEED_002', 'Quero comprar', now() - interval '8 minutes'),
  ('5511999990001', 'main-instance', 'out', NULL,           'Ótimo! É para pessoa física (PF) ou jurídica (PJ)?', now() - interval '7 minutes'),
  ('5511999990001', 'main-instance', 'in',  'MSG_SEED_003', 'Pessoa física', now() - interval '6 minutes');

-- Chat messages for User 2 (2 messages)
INSERT INTO chat_messages (user_id, instance, direction, message_id, text, created_at) VALUES
  ('5511999990002', 'main-instance', 'in',  'MSG_SEED_004', 'Preciso da segunda via do boleto', now() - interval '5 minutes'),
  ('5511999990002', 'main-instance', 'out', NULL,           'Claro! Por favor, informe o número da fatura ou seu CPF/CNPJ.', now() - interval '4 minutes');

-- Known message_id for dedup testing
INSERT INTO chat_messages (user_id, instance, direction, message_id, text, created_at) VALUES
  ('5511999990001', 'main-instance', 'in', 'MSG_DEDUP_TEST_001', 'Mensagem para teste de dedup', now() - interval '1 minute');
