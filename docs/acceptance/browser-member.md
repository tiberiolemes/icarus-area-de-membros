# Jornada local do aluno

23/11/2026. Navegador Orca, perfis isolados e dados explicitamente DEMONSTRAÇÃO. Fonte da UI `8b313f1f7f9c3a385e0d0d29651847740d179316`; nenhuma credencial humana foi usada.

- Login por senha e onboarding: nome da empresa obrigatório pôde ser preenchido mesmo sem questionário configurado. O primeiro teste encontrou esse bloqueio; a correção foi repetida no navegador.
- Membro sem assinatura abriu a prévia textual, concluiu pela ação explícita e recebeu confirmação do servidor. A aula privada foi negada pela causa correta.
- Ticket urgente criado por formulário AJAX; publicação de comunidade enviada como pendente e exibida ao próprio autor com aviso de revisão humana. A aprovação foi feita depois pela equipe no fluxo administrativo.
- Guia da comunidade apresentou dois alvos reais; avançar e pausar funcionaram. O mesmo componente permanece no header e deixou de cobrir ações da aula.
- Tema escuro salvo no servidor persistiu após reload, logout e novo login; outro usuário permaneceu claro em perfil separado. Capturas de login, aula móvel e tema foram abertas para inspeção.
- Administrador concedeu cortesia pelo formulário, reautenticação nativa e motivo; o papel do aluno permaneceu `member`. A sessão anterior foi revogada. Após correção da FK de nonce, logout global retornou ao login normalmente.
- Usuário autorizado reproduziu o MP4 privado real de oito segundos por controles nativos; 63 eventos `timeupdate` confiáveis foram observados, com máximo de oito segundos. Salvar retomada e concluir manualmente receberam confirmação do servidor. Isto não é vídeo Bunny nem conclusão automática.
- Outro ator reproduziu e pausou em **3,061658 segundos**, salvou, recarregou e retomou exatamente esse ponto. Logout nativo e novo login restauraram os mesmos 3,061658 segundos, player pausado, `readyState=4` e duração oito segundos.
- Recuperação de senha: conta sintética exclusiva abriu link nativo de recuperação em perfil novo, passou pelo callback e pela tela de nova senha. Auth recusou a senha anterior e aceitou a nova no mesmo usuário. A conta de teste e o proxy local de redirecionamento foram removidos depois. O link foi gerado pela API administrativa para testar o callback; recebimento no Mailpit pertence ao teste separado de convite.

No recorte móvel emulado de 390px, a aula não apresentou overflow horizontal. Alguns cliques emulados iniciais não dispararam; as interações bem-sucedidas de teclado foram registradas separadamente. Emulação não comprova toque físico. Não há certificação completa de acessibilidade ou teste com público leigo inferidos dessas capturas.

O primeiro logout500 foi preservado como falha real: uma FK de credencial efêmera impedia a remoção nativa da sessão. A migration018 corrige somente essa dependência; provas nativas de nonce pendente/consumido, auditoria preservada e terceiro intacto estão no aceite de integrações.

Os recibos brutos e dados de acesso permanecem privados em `.local/`. Nenhuma senha, JWT, link de recuperação ou URL privada assinada integra este relatório.
