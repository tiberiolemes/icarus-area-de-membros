"""Pin the published Vue Flow ESM dependency where it exposes no phrase API."""
import argparse
import json
import re
from pathlib import Path

from finalize_package_overlay import digest,replacements
from prepare_package_overlay import helper

HERE=Path(__file__).parent
TRANSLATIONS={
'callback is not a function':'A função de retorno não é uma função',
'too late; already scheduled':'A operação já foi agendada',
'too late; already running':'A operação já está em execução',
'transition not found':'Transição não encontrada',
'transition {0} not found':'Transição {0} não encontrada',
"Can't create edge. An edge needs a source and a target.":'Não é possível criar a conexão. Uma conexão precisa de origem e destino.',
"Can't create new edge. An edge needs a source and a target.":'Não é possível criar uma nova conexão. Uma conexão precisa de origem e destino.',
'The old edge with id={0} does not exist.':'A conexão anterior com id={0} não existe.',
'The padding value "{0}" is invalid. Please provide a number or a string with a valid unit (px or %).':'O valor de espaçamento "{0}" é inválido. Informe um número ou um texto com uma unidade válida (px ou %).',
"It seems that you haven't loaded the necessary styles. Please import '@vue-flow/core/dist/style.css' to ensure that the graph is rendered correctly":"Os estilos necessários não foram carregados. Importe '@vue-flow/core/dist/style.css' para que o diagrama seja exibido corretamente.",
'The Vue Flow parent container needs a width and a height to render the graph':'O contêiner principal do diagrama precisa de largura e altura para exibi-lo.',
'Node is invalid\nNode: {0}':'O bloco é inválido\nBloco: {0}',
'Node not found\nNode: {0}':'Bloco não encontrado\nBloco: {0}',
'Node is missing a parent\nNode: {0}\nParent: {1}':'O bloco não tem um bloco principal\nBloco: {0}\nBloco principal: {1}',
'Node type is missing\nType: {0}':'O tipo do bloco não foi informado\nTipo: {0}',
'Only child nodes can use a parent extent\nNode: {0}':'Apenas blocos filhos podem usar os limites de um bloco principal\nBloco: {0}',
'An edge needs a source and a target\nEdge: {0}':'Uma conexão precisa de origem e destino\nConexão: {0}',
'Edge source is missing\nEdge: {0} \nSource: {1}':'A origem da conexão não foi informada\nConexão: {0} \nOrigem: {1}',
'Edge target is missing\nEdge: {0} \nTarget: {1}':'O destino da conexão não foi informado\nConexão: {0} \nDestino: {1}',
'Edge type is missing\nType: {0}':'O tipo da conexão não foi informado\nTipo: {0}',
'Edge source and target are the same\nEdge: {0} \nSource: {1} \nTarget: {2}':'A origem e o destino da conexão são iguais\nConexão: {0} \nOrigem: {1} \nDestino: {2}',
'Edge source or target is missing\nEdge: {0} \nSource: {1} \nTarget: {2}':'A origem ou o destino da conexão não foi informado\nConexão: {0} \nOrigem: {1} \nDestino: {2}',
'Edge was orphaned (suddenly missing source or target) and has been removed\nEdge: {0}':'A conexão perdeu a origem ou o destino e foi removida\nConexão: {0}',
'Edge not found\nEdge: {0}':'Conexão não encontrada\nConexão: {0}',
'The options parameter is deprecated and will be removed in the next major version. Please use the id parameter instead':'O parâmetro options está obsoleto e será removido na próxima versão principal. Use o parâmetro id.',
'[ID UNKNOWN|INDEX {0}]':'[ID DESCONHECIDO|ÍNDICE {0}]',
'Viewport not initialized yet.':'A área de visualização ainda não foi inicializada.',
'No store instance found for id {0} in storage.':'Nenhuma instância de estado foi encontrada para o ID {0} no armazenamento.',
'Viewport element is missing':'O elemento da área de visualização não foi encontrado',
'Press enter or space to select a node.':'Pressione Enter ou espaço para selecionar um bloco.',
'You can then use the arrow keys to move the node around.':'Use as teclas de seta para mover o bloco.',
'You can then use the arrow keys to move the node around, press delete to remove it and press escape to cancel.':'Use as teclas de seta para mover o bloco, Delete para removê-lo e Escape para cancelar.',
'Press enter or space to select an edge. You can then press delete to remove it or press escape to cancel.':'Pressione Enter ou espaço para selecionar uma conexão. Use Delete para removê-la ou Escape para cancelar.',
'Edge from {0} to {1}':'Conexão de {0} para {1}',
'Moved selected node {0}. New position, x: {1}, y: {2}':'O bloco selecionado {0} foi movido. Nova posição, x: {1}, y: {2}',
'You are trying to set node data via useNodesData. This is not supported.':'Não é possível definir dados de blocos por useNodesData.',
'You are trying to set edge data via useEdgesData. This is not supported.':'Não é possível definir dados de conexões por useEdgesData.',
'Graph node':'Bloco do diagrama','Graph edge':'Conexão do diagrama',
}

def generate(plan,output):
    patches=[];review=[];transformed={}
    for name,data in plan.items():
        assert data['version']==('1.26.0' if name.startswith('node_modules/') else '1.48.2'),name
        file=name+'/dist/vue-flow-core.mjs';original=data['source'];source=original
        # Node parser offsets are UTF16; the published file is ASCII except a few Unicode comments.
        def offset(value):return len(original.encode('utf-16-le')[:value*2].decode('utf-16-le'))
        edits=[]
        for row in data['messages']:
            value=row['value'];key=value.strip()
            if key in TRANSLATIONS:
                args=', ['+', '.join(row.get('args',[]))+']' if row.get('args') else ''
                replacement='__pt('+json.dumps(key)+args+')'
                if value!=key:replacement='('+json.dumps(value[:len(value)-len(value.lstrip())])+ ' + '+replacement+' + '+json.dumps(value[len(value.rstrip()):])+')'
                edits.append((offset(row['start']),offset(row['end']),replacement));decision='translated';reason='Complete display/error/a11y message, with expression arguments retained.'
            elif key.startswith(('^rgb','^rgba','^hsl','^hsla','translate(','.{0}-flow__handle[','.vue-flow__handle[')) or key in ['rect(0px, 0px, 0px, 0px)','vue-flow__edges vue-flow__connectionline vue-flow__container']:
                decision='technical';reason='Exact CSS transform/class/selector/clip geometry or color regex; an executable value rather than a sentence.'
            else:raise ValueError('Unreviewed dependency literal: '+key)
            review.append({'path':file,'source':value,'decision':decision,'reason':reason,'line':original[:offset(row['start'])].count('\n')+1})
        for start,end,text in sorted(edits,reverse=True):source=source[:start]+text+source[end:]
        for role,key in [('node','Graph node'),('edge','Graph edge')]:
            old='"aria-roledescription": "'+role+'"'
            if data['version']=='1.26.0':
                assert source.count(old)==0
                continue
            assert source.count(old)==1
            source=source.replace(old,'"aria-roledescription": __pt('+json.dumps(key)+')')
        source=helper(file)+'\n'+source
        transformed[file]=source
        patches.append({'path':file,'before_sha256':digest(original),'after_sha256':digest(source),'replacements':replacements(original,source)})
    manifest={'framework_version':'16.60.2','version_file':'frappe/__init__.py','dependency':'@vue-flow/core','dependency_versions':{name:data['version'] for name,data in plan.items()},'patches':patches}
    (HERE/'framework-dependency-overlay.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    (HERE/'DEPENDENCY-SOURCE-REVIEW.json').write_text(json.dumps({'criterion':'Published ESM dependency has no phrase API. All multiword literals/templates reviewed; only CSS/regex selectors are technical. Single-word accessibility role descriptions are also localized; ARIA roles and IDs remain raw.','records':review},ensure_ascii=False,indent=2)+'\n')
    messages=json.loads((HERE/'framework-packages-pt-BR.json').read_text());messages.update(TRANSLATIONS)
    (HERE/'framework-packages-pt-BR.json').write_text(json.dumps(messages,ensure_ascii=False,indent=2)+'\n')
    output.write_text(json.dumps({'originals':{name+'/dist/vue-flow-core.mjs':data['source'] for name,data in plan.items()},'patched':transformed},ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'dependency_files':len(patches),'reviewed_records':len(review)}))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--plan',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();generate(json.loads(a.plan.read_text()),a.output)
