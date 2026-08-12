"""Remove o fundo creme da logo e gera as variantes usadas no site.

O fundo e uma cor chapada, entao o recorte e feito por preenchimento
a partir das bordas: so vira transparente o creme que esta LIGADO a
borda. Assim o creme de dentro do desenho (olhos, pagina do livro)
e preservado.
"""
import io
from collections import deque

import numpy as np
from PIL import Image, ImageFilter

ORIGEM = "logo-original.jpg"
TOLERANCIA = 34      # distancia de cor aceita como "fundo"
SUAVIZAR = 0.7       # desfoque do alfa, para a borda nao ficar serrilhada


def carregar():
    im = Image.open(ORIGEM).convert("RGB")
    return im, np.asarray(im).astype(np.int16)


def mascara_de_fundo(arr):
    """True onde e fundo (creme conectado a borda)."""
    alt, larg, _ = arr.shape
    # Cor de referencia: mediana das quatro bordas.
    bordas = np.concatenate([
        arr[0, :, :], arr[-1, :, :], arr[:, 0, :], arr[:, -1, :]
    ])
    cor = np.median(bordas, axis=0)

    parecido = np.sqrt(((arr - cor) ** 2).sum(axis=2)) <= TOLERANCIA

    fundo = np.zeros((alt, larg), dtype=bool)
    fila = deque()

    def semear(y, x):
        if parecido[y, x] and not fundo[y, x]:
            fundo[y, x] = True
            fila.append((y, x))

    for x in range(larg):
        semear(0, x)
        semear(alt - 1, x)
    for y in range(alt):
        semear(y, 0)
        semear(y, larg - 1)

    while fila:
        y, x = fila.popleft()
        if y > 0:
            semear(y - 1, x)
        if y < alt - 1:
            semear(y + 1, x)
        if x > 0:
            semear(y, x - 1)
        if x < larg - 1:
            semear(y, x + 1)

    return fundo, cor


def componentes(mask):
    """Rotula regioes conectadas de True. Devolve (rotulos, contagens)."""
    alt, larg = mask.shape
    rot = np.zeros((alt, larg), dtype=np.int32)
    atual = 0
    contagens = {}
    for y0 in range(alt):
        for x0 in range(larg):
            if not mask[y0, x0] or rot[y0, x0]:
                continue
            atual += 1
            n = 0
            fila = deque([(y0, x0)])
            rot[y0, x0] = atual
            while fila:
                y, x = fila.popleft()
                n += 1
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < alt and 0 <= nx < larg:
                        if mask[ny, nx] and not rot[ny, nx]:
                            rot[ny, nx] = atual
                            fila.append((ny, nx))
            contagens[atual] = n
    return rot, contagens


def caixa(mask):
    ys, xs = np.where(mask)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def main():
    im, arr = carregar()
    fundo, cor = mascara_de_fundo(arr)
    frente = ~fundo
    print(f"cor de fundo detectada: {tuple(int(c) for c in cor)}")
    print(f"frente: {frente.mean() * 100:.1f}% da imagem")

    # ── Logo completa, fundo transparente ──────────────────────
    alfa = Image.fromarray((frente * 255).astype(np.uint8), mode="L")
    alfa = alfa.filter(ImageFilter.GaussianBlur(SUAVIZAR))
    completa = im.convert("RGBA")
    completa.putalpha(alfa)
    completa.crop(caixa(frente)).save("logo.png")
    print("logo.png:", Image.open("logo.png").size)

    # ── So o simbolo (maior regiao conectada = o circulo) ───────
    rot, cont = componentes(frente)
    maior = max(cont, key=cont.get)
    circulo = rot == maior
    x0, y0, x1, y1 = caixa(circulo)
    print(f"simbolo em ({x0},{y0})-({x1},{y1}) — {cont[maior]} px")

    simbolo = completa.crop((x0, y0, x1, y1))
    simbolo.save("logo-simbolo.png")
    print("logo-simbolo.png:", simbolo.size)

    # ── Favicons (reducao com LANCZOS) ─────────────────────────
    lado = max(simbolo.size)
    quadrado = Image.new("RGBA", (lado, lado), (0, 0, 0, 0))
    quadrado.paste(
        simbolo,
        ((lado - simbolo.size[0]) // 2, (lado - simbolo.size[1]) // 2),
    )
    quadrado.resize((180, 180), Image.LANCZOS).save("apple-touch-icon.png")
    quadrado.resize((32, 32), Image.LANCZOS).save("favicon-32.png")
    quadrado.save("favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    print("favicons gerados")


if __name__ == "__main__":
    main()
