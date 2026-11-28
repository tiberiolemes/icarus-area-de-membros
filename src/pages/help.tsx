import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth";
import { Loading } from "../ui";
import { PublicFrame } from "./access";
import { HelpContent } from "./help-article";

export function Help({ member = false }: { member?: boolean }) {
  const { artigo } = useParams();
  const [params, setParams] = useSearchParams();
  const { session, loading } = useAuth();

  if (!member && loading) return <PublicFrame><Loading /></PublicFrame>;
  // toString, e não size: o Safari anterior ao 17 não tem URLSearchParams.size e perderia a busca.
  const query = params.toString();
  if (!member && session)
    return <Navigate replace to={"/app/ajuda" + (artigo ? "/" + encodeURIComponent(artigo) : "") + (query && "?" + query)} />;

  const content = <HelpContent member={member} artigo={artigo} params={params} setParams={setParams} />;
  return member ? content : <PublicFrame>{content}</PublicFrame>;
}
