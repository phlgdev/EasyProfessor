"""Testa as regras do Firestore no simulador oficial do Firebase.

Roda os casos contra o arquivo firestore.rules local, então dá para
verificar uma mudança antes de publicá-la.

Uso:  python scripts/testar_regras.py <access-token>
"""
import io
import json
import sys
import urllib.error
import urllib.request

PROJETO = 'easyprofessor-c9a61'

# nome, método, caminho, auth (None = deslogado), resultado esperado
TESTES = [
    ('ler o próprio documento', 'get', 'usuarios/UID123',
     {'uid': 'UID123', 'token': {'email': 'a@b.com', 'email_verified': True}}, 'ALLOW'),
    ('gravar no próprio documento', 'create', 'usuarios/UID123',
     {'uid': 'UID123', 'token': {'email': 'a@b.com', 'email_verified': True}}, 'ALLOW'),
    ('ler o documento de outra pessoa', 'get', 'usuarios/OUTRO',
     {'uid': 'UID123', 'token': {'email': 'a@b.com', 'email_verified': True}}, 'DENY'),
    ('ler sem estar logado', 'get', 'usuarios/UID123', None, 'DENY'),
    ('ler a própria isenção', 'get', 'isentos/a@b.com',
     {'uid': 'UID123', 'token': {'email': 'a@b.com', 'email_verified': True}}, 'ALLOW'),
    ('ler a isenção de outro', 'get', 'isentos/outro@b.com',
     {'uid': 'UID123', 'token': {'email': 'a@b.com', 'email_verified': True}}, 'DENY'),
    ('se auto-isentar', 'create', 'isentos/a@b.com',
     {'uid': 'UID123', 'token': {'email': 'a@b.com', 'email_verified': True}}, 'DENY'),
]


def main(token):
    regras = io.open('firestore.rules', encoding='utf-8').read()

    casos = []
    for _, metodo, caminho, auth, _esperado in TESTES:
        req = {'path': f'/databases/(default)/documents/{caminho}', 'method': metodo}
        if auth:
            req['auth'] = auth
        # Pedimos ALLOW em todos: o simulador responde SUCCESS/FAILURE,
        # e comparamos com o que realmente esperávamos.
        casos.append({'expectation': 'ALLOW', 'request': req})

    corpo = {
        'source': {'files': [{'name': 'firestore.rules', 'content': regras}]},
        'testSuite': {'testCases': casos},
    }

    pedido = urllib.request.Request(
        f'https://firebaserules.googleapis.com/v1/projects/{PROJETO}:test',
        data=json.dumps(corpo).encode(), method='POST',
        headers={
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json',
            'x-goog-user-project': PROJETO,
        })

    try:
        resposta = json.load(urllib.request.urlopen(pedido))
    except urllib.error.HTTPError as e:
        print('ERRO', e.code, e.read().decode()[:400])
        return 1

    falhas = 0
    for (nome, _, _, _, esperado), r in zip(TESTES, resposta.get('testResults', [])):
        real = 'ALLOW' if r.get('state') == 'SUCCESS' else 'DENY'
        ok = real == esperado
        if not ok:
            falhas += 1
        marca = 'ok   ' if ok else 'FALHA'
        print(f'{marca} {nome}: esperado {esperado}, obtido {real}')

    print('todas as regras se comportam como planejado' if not falhas
          else f'{falhas} regra(s) fora do esperado')
    return 1 if falhas else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1]))
