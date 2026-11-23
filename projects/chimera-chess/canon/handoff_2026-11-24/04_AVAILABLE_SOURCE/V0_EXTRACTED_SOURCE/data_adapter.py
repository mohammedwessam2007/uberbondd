"""Optional PGN adapter. Requires python-chess, not bundled in this ZIP."""
from __future__ import annotations
import hashlib
from pathlib import Path
from typing import Iterator
import torch

from chimera import PLAYERS

ALIASES = {
  0: ('nezhmetdinov', 'nezmetdinov'),
  1: ('mikhail tal','tal, m', 'tal, mikhail', 'tal m'),
  2: ('basman',),
  3: ('shirov',),
  4: ('daniil dubov','dubov, d', 'dubov d'),
}
SYMBOL = {p:i for i,p in enumerate('PNBRQKpnbrqk')}
PROMO = {None:0, 2:1, 3:2, 4:3, 5:4}


def identify(name):
    name = ' '.join(name.lower().split())
    for i, aliases in ALIASES.items():
        if any(a in name for a in aliases):
            return i
    return None


def encode_board(board):
    planes=torch.zeros(18,8,8,dtype=torch.float32)
    for square,piece in board.piece_map().items():
        rank,file = divmod(square,8)
        planes[SYMBOL[piece.symbol()], rank, file] = 1
    planes[12].fill_(float(board.turn))
    import chess
    for j, color in enumerate((chess.WHITE, chess.WHITE, chess.BLACK, chess.BLACK)):
        # python-chess has no KINGSIDE constant; use its explicit predicates.
        rights=(board.has_kingside_castling_rights(color) if j%2==0
                else board.has_queenside_castling_rights(color))
        planes[13+j].fill_(float(rights))
    if board.ep_square is not None:
        rank,file=divmod(board.ep_square,8)
        planes[17,rank,file]=1
    return planes


def encode_moves(board):
    import chess
    legal=list(board.legal_moves)
    ids=[]; flags=[]
    for move in legal:
        is_capture=float(board.is_capture(move))
        is_castle=float(board.is_castling(move))
        promo=float(move.promotion is not None)
        board.push(move)
        check=float(board.is_check())
        board.pop()
        ids.append([move.from_square,move.to_square,PROMO[move.promotion]])
        flags.append([is_capture,check,is_castle,promo])
    if not legal:
        return None
    return legal,torch.tensor(ids,dtype=torch.long),torch.tensor(flags,dtype=torch.float32)


def records(folder:Path, max_games=None, max_plies=200)-> Iterator[dict]:
    import chess.pgn
    scanned=0
    paths=list(sorted(folder.rglob('*.pgn')))
    for path in paths:
        with path.open('r',encoding='utf-8-sig',errors='replace') as h:
            while (max_games is None or scanned < max_games):
                game=chess.pgn.read_game(h)
                if game is None:break
                scanned+=1
                if game.errors:continue
                participants=(identify(game.headers.get('White','')),
                              identify(game.headers.get('Black','')))
                if participants==(None,None):continue
                game_key='|'.join([game.headers.get(k,'') for k in
                                   ('White','Black','Date','Event','Round')])
                game_id=hashlib.sha256(game_key.encode()).hexdigest()
                split=int(game_id[:8],16)%10
                subset='train' if split<8 else 'val' if split==8 else 'test'
                board=game.board()
                for ply,move in enumerate(game.mainline_moves()):
                    if ply>=max_plies:break
                    player_id=participants[0 if board.turn else 1]
                    if player_id is not None:
                        choices=encode_moves(board)
                        if choices is None:break
                        legal,moves,flags=choices
                        if move in legal:
                            yield {'board':encode_board(board),'moves':moves,
                                   'features':flags,'target':legal.index(move),
                                   'player_id':player_id,'split':subset,
                                   'game_id':game_id}
                    board.push(move)
            if max_games is not None and scanned>=max_games:break


def pad_batch(rows):
    B=len(rows); M=max(len(r['moves']) for r in rows)
    boards=torch.stack([r['board'] for r in rows])
    moves=torch.zeros(B,M,3,dtype=torch.long)
    features=torch.zeros(B,M,4)
    mask=torch.zeros(B,M,dtype=torch.bool)
    for i,r in enumerate(rows):
        m=len(r['moves'])
        moves[i,:m]=r['moves'];features[i,:m]=r['features'];mask[i,:m]=1
    targets=torch.tensor([r['target'] for r in rows],dtype=torch.long)
    players=torch.tensor([r['player_id'] for r in rows],dtype=torch.long)
    return boards,moves,features,mask,targets,players
