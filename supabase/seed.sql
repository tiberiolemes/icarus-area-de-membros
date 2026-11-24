-- Conteúdo operacional do formulário; nenhuma pessoa, senha, preço ou oferta real.
insert into public.ica_onboarding_questions(key,label,type,options,required,active,order_index) values
 ('name','Nome da empresa','text','[]',true,true,0),
 ('role','Seu cargo','select','["Founder/CEO","Co-founder","C-level (CTO/CPO/CRO)","Head / VP","Gerente","Outro"]',true,true,1),
 ('size','Tamanho do time','select','["Só eu","2–5","6–20","21–50","51+"]',true,true,2),
 ('stage','Estágio do produto','select','["Ainda é ideia","Em desenvolvimento (MVP)","Em produção com clientes","Escalando"]',true,true,3),
 ('segment','Segmento','text','[]',false,true,4),
 ('product_description','O que seu produto faz','textarea','[]',false,true,5),
 ('revenue_range','Faturamento mensal','text','[]',false,true,6),
 ('acquisition','Como consegue clientes hoje','text','[]',false,true,7)
on conflict(key) do nothing;
-- Opções completas de segmento, faturamento e aquisição não constam no PRD.
-- Permanecem texto livre editável, sem faixas inventadas.
