import { Link, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth";
import { rpc } from "../api";
import { Action, Back, Heading, Search } from "../ui";
import { PublicFrame } from "./access";

export const articles = [
  {
    slug: "acesso",
    title: "Entre, confirme seu email e recupere o acesso",
    steps: [
      "Na tela Entrar, informe email e senha. Um link de aula recebido é preservado como destino interno depois do acesso.",
      "Se você acabou de criar sua conta, abra a confirmação enviada pelo sistema de autenticação. O link tem validade limitada. Use Confirmar email para solicitar outro.",
      "Esqueceu a senha? Abra Recuperar acesso e solicite as instruções. O sistema não confirma a existência de uma conta pelo endereço informado.",
      "Complete o perfil e as perguntas de empresa. Responda os campos marcados como obrigatórios. Você pode editar essas respostas em Configurações.",
      "Na administração, cadastre um aplicativo autenticador e valide o código de seis dígitos. A permissão é verificada novamente no servidor.",
    ],
  },
  {
    slug: "cursos",
    title: "Abra uma aula e continue de onde parou",
    steps: [
      "Em Cursos, busque pelo título e abra o curso. Veja os módulos e as aulas na lista de conteúdo.",
      "Cada curso, módulo e aula tem endereço próprio. Use esses links para retornar diretamente ao conteúdo.",
      "O cadeado indica acesso restrito. Consulte sua assinatura; o servidor decide o acesso em cada operação.",
      "No vídeo nativo, a posição é salva durante a reprodução e ao pausar. Use Salvar ponto de retomada para confirmar manualmente.",
      "Marque a aula como concluída ao finalizar. O progresso só muda depois da confirmação do servidor. Sem provedor de vídeo configurado, a tela informa a causa.",
    ],
  },
  {
    slug: "materiais",
    title: "Encontre e baixe seus materiais",
    steps: [
      "Abra Materiais no menu e escolha uma pasta. A busca consulta os arquivos da pasta atual.",
      "Confira nome, tipo e tamanho. Materiais restritos mostram a opção de consultar o acesso.",
      "Clique em Baixar. O sistema valida seu acesso e solicita um endereço temporário do arquivo.",
      "Se o endereço expirar, solicite o download novamente. Nunca compartilhe um endereço temporário de conteúdo privado.",
    ],
  },
  {
    slug: "certificados",
    title: "Consulte e verifique um certificado",
    steps: [
      "Conclua todas as aulas obrigatórias de um curso com certificado habilitado. Currículo vazio não emite certificado.",
      "Abra Certificados para consultar o documento emitido. Se a configuração foi completada depois, use Emitir certificado quando essa ação estiver disponível.",
      "O documento usa o nome, curso, carga horária, responsável e data registrados na emissão. Uma edição posterior não reescreve esse registro.",
      "Use Baixar PDF ou Baixar PNG. O código do documento abre a verificação pública sem email ou documento pessoal.",
      "Um certificado de demonstração é identificado como sem validade acadêmica. Um certificado revogado informa seu estado e não oferece exportação como válido.",
    ],
  },
  {
    slug: "comunidade",
    title: "Publique e acompanhe a revisão humana",
    steps: [
      "Abra Comunidade, escolha um espaço e use Escrever publicação. Informe título, espaço e texto.",
      "Envie para revisão. Apenas você e a equipe autorizada veem a publicação pendente. Você pode anexar uma imagem depois do envio.",
      "A publicação aparece aos demais membros quando a equipe aprovar. Editar o texto envia o conteúdo novamente para revisão.",
      "Abra a publicação para responder ou votar. Respostas também passam por revisão.",
      "Para denunciar, descreva o motivo. A denúncia entra na fila da equipe; a contagem não remove o conteúdo automaticamente.",
    ],
  },
  {
    slug: "suporte",
    title: "Abra um ticket e acompanhe a conversa",
    steps: [
      "Em Suporte, use Abrir ticket. Escreva assunto, prioridade e mensagem sem senhas ou dados de cartão.",
      "Após o envio, abra a conversa para ler as respostas. Seu texto permanece na tela se uma chamada falhar.",
      "Use Enviar arquivo para anexar um documento permitido. O servidor valida tamanho, tipo e sua permissão.",
      "Um ticket resolvido pode ser reaberto com uma resposta. Arquivos da conversa só abrem para pessoas autorizadas.",
    ],
  },
  {
    slug: "conta",
    title: "Atualize perfil, tema, segurança e privacidade",
    steps: [
      "Abra Configurações e atualize seu nome, telefone e bio. Em Sua empresa, edite as respostas do onboarding.",
      "Em Aparência, escolha Claro ou Escuro e salve. A preferência acompanha sua conta e não é herdada por outro membro.",
      "Em Segurança, solicite troca de email ou senha. A mudança de email exige confirmação. Configure o autenticador de dois fatores.",
      "Assinatura mostra o plano e a validade confirmados. No checkout, Pix é à vista; o cartão permite escolher de 1 a 12 parcelas, com valores e condições finais no ambiente seguro do provedor. Sem provedor configurado, o checkout informa a indisponibilidade e nenhuma cobrança é realizada.",
      "Em Privacidade, exporte seus dados ou envie um pedido de exclusão. O pedido aguarda análise de retenção legal; não significa exclusão imediata.",
    ],
  },
  {
    slug: "administracao",
    title: "Cadastre conteúdo e opere as filas",
    steps: [
      "Em Conteúdo, crie um curso e salve. Defina título, endereço, descrição rica e acesso.",
      "Em Estrutura e aulas, crie módulo, seção e aula. Use Subir e Descer para ordenar com teclado. Defina duração e aulas obrigatórias.",
      "Configure o responsável pelo certificado antes de habilitar a emissão. Use dados reais ou identifique uma demonstração.",
      "Em Materiais, crie pasta e registro do arquivo, depois envie o arquivo privado. Confira a confirmação do servidor.",
      "Gerencie cortesia, validade, suspensão e papel na ficha do membro. Informe motivo e reautentique. Cortesia não é pagamento.",
      "Na fila da comunidade, revise o conteúdo e confirme uma decisão com motivo. Na fila de suporte, responda a conversa e ajuste o estado.",
      "Em Membros e Pedidos, a exportação CSV percorre todas as páginas da busca atual, até 5.000 registros. Refine a busca acima desse limite. Uma falha interrompe a exportação sem gerar arquivo parcial; o CSV contém somente as colunas autorizadas exibidas nessas listas.",
      "Em Configurações, revise perguntas e versões legais. Secrets dos provedores são configurados apenas no servidor.",
    ],
  },
];
export function Help() {
  const { artigo } = useParams(),
    [params, setParams] = useSearchParams(),
    { session } = useAuth(),
    q = params.get("q") ?? "",
    article = articles.find((a) => a.slug === artigo);
  return (
    <PublicFrame>
      <div className="reading">
        {artigo ? (
          <>
            <Back to="/ajuda" label="Central de ajuda" />
            <Heading title={article?.title ?? "Artigo não encontrado"} />
            {article ? (
              <>
                <ol className="help-steps">
                  {article.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                {session && (
                  <section>
                    <h2>Este artigo ajudou?</h2>
                    <Action
                      run={() =>
                        rpc("app_help_feedback", {
                          p_page: "/ajuda/" + article.slug,
                          p_action: "rate",
                          p_rating: true,
                        })
                      }
                    >
                      Sim
                    </Action>
                    <Action
                      run={() =>
                        rpc("app_help_feedback", {
                          p_page: "/ajuda/" + article.slug,
                          p_action: "rate",
                          p_rating: false,
                        })
                      }
                    >
                      Não
                    </Action>
                  </section>
                )}
                <Link className="button" to="/app/suporte/novo">
                  Preciso de suporte
                </Link>
              </>
            ) : (
              <Link to="/ajuda">Ver todos os artigos</Link>
            )}
          </>
        ) : (
          <>
            <Heading title="Como podemos ajudar?">
              Passos para usar sua área de membros.
            </Heading>
            <Search initial={q} onSearch={(q) => setParams({ q })} />
            <div className="help-list">
              {articles
                .filter((a) =>
                  (a.title + " " + a.steps.join(" "))
                    .toLocaleLowerCase("pt-BR")
                    .includes(q.toLocaleLowerCase("pt-BR")),
                )
                .map((article) => (
                  <Link key={article.slug} to={"/ajuda/" + article.slug}>
                    {article.title}
                  </Link>
                ))}
            </div>
            <Link to="/app/cursos">Voltar à área de membros</Link>
          </>
        )}
      </div>
    </PublicFrame>
  );
}
