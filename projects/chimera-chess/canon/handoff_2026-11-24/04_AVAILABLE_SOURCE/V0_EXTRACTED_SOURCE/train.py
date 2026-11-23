"""Bounded demonstration trainer for player-specific move imitation.

Requires real, legally obtained PGNs. Does not download any games.
No claim of a strong trained engine. Uses only supervised imitation in v0.
"""
import argparse, json
from pathlib import Path
import torch
from chimera import Chimera, supervised_loss
from data_adapter import records, pad_batch


def train(args):
    torch.manual_seed(args.seed)
    torch.set_num_threads(min(4,torch.get_num_threads()))
    try:
        samples=list(records(Path(args.pgn_folder),max_games=args.max_games))
    except ModuleNotFoundError as e:
        raise SystemExit('Install the separately licensed python-chess package: pip install python-chess') from e
    training=[r for r in samples if r['split']=='train']
    validation=[r for r in samples if r['split']=='val']
    if not training:raise SystemExit('No target-player positions found in PGN sources.')
    model=Chimera(width=args.width,layers=args.layers)
    optimizer=torch.optim.AdamW(model.parameters(),lr=args.lr,weight_decay=0.01)
    def batched(rows):
        for i in range(0,len(rows),args.batch_size):yield pad_batch(rows[i:i+args.batch_size])
    report={'n_positions':len(samples),'train':len(training),'val':len(validation),
            'test':sum(r['split']=='test' for r in samples),'epochs':[]}
    for epoch in range(args.epochs):
        model.train();g=torch.Generator().manual_seed(args.seed+epoch)
        shuffled=[training[i] for i in torch.randperm(len(training),generator=g).tolist()]
        losses=[]
        for board,moves,features,mask,target,player in batched(shuffled):
            optimizer.zero_grad(set_to_none=True)
            out=model(board,moves,features,mask)
            loss=supervised_loss(out,target,player)
            loss.backward();torch.nn.utils.clip_grad_norm_(model.parameters(),1.0)
            optimizer.step();losses.append(float(loss.detach()))
        model.eval();correct=total=0
        with torch.no_grad():
            for board,moves,features,mask,target,player in batched(validation):
                out=model(board,moves,features,mask)
                correct+=int((out.logits.argmax(1)==target).sum());total+=len(target)
        row={'epoch':epoch+1,'train_loss_mean':sum(losses)/len(losses),
             'val_move_match':correct/total if total else None}
        report['epochs'].append(row);print(json.dumps(row))
    target=Path(args.output);target.mkdir(parents=True,exist_ok=True)
    torch.save({'model':model.state_dict(),'architecture':{'width':args.width,'layers':args.layers},
                'emergent_enabled':False,'train_status':'supervised_imitation_only'},target/'chimera.pt')
    (target/'training_report.json').write_text(json.dumps(report,indent=2))
    print(f'Saved model and report to {target}; playing strength NOT established')

if __name__=='__main__':
    ap=argparse.ArgumentParser()
    ap.add_argument('--pgn-folder',required=True)
    ap.add_argument('--output',default='training_output')
    ap.add_argument('--max-games',type=int,default=100)
    ap.add_argument('--epochs',type=int,default=2)
    ap.add_argument('--batch-size',type=int,default=16)
    ap.add_argument('--width',type=int,default=96)
    ap.add_argument('--layers',type=int,default=2)
    ap.add_argument('--seed',type=int,default=52026)
    ap.add_argument('--lr',type=float,default=0.0003)
    train(ap.parse_args())
