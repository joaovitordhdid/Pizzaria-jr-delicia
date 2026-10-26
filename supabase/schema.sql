-- Pizzaria Jr Delícia: rode isto no SQL Editor do Supabase (uma vez).

create table if not exists jr_admins (
  email text primary key
);

create table if not exists jr_kv (
  key text primary key,          -- 'menu', 'stock', 'expenses'
  value jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists jr_orders (
  id uuid primary key,
  code text not null,
  status text not null default 'novo',
  created_at timestamptz not null default now(),
  customer jsonb not null,
  items jsonb not null,
  totals jsonb not null,
  payment jsonb,
  invoice jsonb,
  fulfillment text,
  stock_applied boolean default false
);

create or replace function jr_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from jr_admins where email = lower(auth.jwt() ->> 'email'));
$$;

alter table jr_admins enable row level security;
alter table jr_kv enable row level security;
alter table jr_orders enable row level security;

-- dono vê a própria linha (o login confere se a conta é de dono)
create policy "admin le admins" on jr_admins for select to authenticated
  using (email = lower(auth.jwt() ->> 'email'));

-- cardápio é público para leitura; o resto só para o dono
create policy "cardapio publico" on jr_kv for select using (key = 'menu' or jr_is_admin());
create policy "dono grava kv" on jr_kv for all to authenticated using (jr_is_admin()) with check (jr_is_admin());

-- clientes só criam pedidos; o dono lê e atualiza
create policy "cliente cria pedido" on jr_orders for insert to anon, authenticated with check (status = 'novo');
create policy "dono le pedidos" on jr_orders for select to authenticated using (jr_is_admin());
create policy "dono atualiza pedidos" on jr_orders for update to authenticated using (jr_is_admin()) with check (jr_is_admin());

-- fotos dos produtos
insert into storage.buckets (id, name, public) values ('fotos', 'fotos', true) on conflict (id) do nothing;
create policy "fotos publicas" on storage.objects for select using (bucket_id = 'fotos');
create policy "dono envia fotos" on storage.objects for insert to authenticated with check (bucket_id = 'fotos' and jr_is_admin());

-- Depois: crie o usuário do dono em Authentication > Users e rode
-- insert into jr_admins (email) values ('email-do-dono@exemplo.com');
