import unittest
import torch
from chimera import Chimera, supervised_loss, guarded_choice

class ChimeraTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        torch.manual_seed(11);torch.set_num_threads(2)
        cls.model=Chimera(width=32,layers=1)
    def get_inputs(self):
        boards=torch.rand(2,18,8,8)
        moves=torch.tensor([[[12,28,0],[6,21,0],[0,0,0]],
                            [[52,36,0],[62,45,0],[48,56,4]]])
        flags=torch.zeros(2,3,4)
        mask=torch.tensor([[1,1,0],[1,1,1]],dtype=torch.bool)
        return boards,moves,flags,mask
    def test_shapes_and_masks(self):
        out=self.model(*self.get_inputs())
        self.assertEqual(tuple(out.logits.shape),(2,3))
        self.assertEqual(tuple(out.gates.shape),(2,6))
        self.assertEqual(tuple(out.plan_state.shape),(2,16))
        self.assertLess(out.logits[0,2],-1e8)
        self.assertTrue(torch.allclose(out.gates.sum(-1),torch.ones(2),atol=1e-6))
        self.assertLess(out.gates[:,5].max(),0.0001)
    def test_padded_experts_are_masked(self):
        out=self.model(*self.get_inputs())
        self.assertTrue(bool((out.expert_logits[0,:,2] < -1e8).all()))
    def test_style_bias_changes_mixture_without_enabling_sixth(self):
        inputs=self.get_inputs()
        original=self.model(*inputs)
        bias=torch.zeros(2,6);bias[:,1]=20
        altered=self.model(*inputs,style_bias=bias)
        self.assertGreater(float(altered.gates[0,1].detach()),0.99)
        self.assertLess(float(original.gates[0,1].detach()),0.99)
        self.assertLess(float(altered.gates[0,5].detach()),0.001)
    def test_training_gradients_and_plan(self):
        v=self.get_inputs();out=self.model(*v)
        loss=supervised_loss(out,torch.tensor([1,2]),torch.tensor([0,4]))
        self.assertTrue(bool(torch.isfinite(loss)))
        loss.backward()
        self.assertIsNotNone(self.model.square_stem.weight.grad)
        out2=self.model(*v,previous_plan=out.plan_state.detach())
        self.assertFalse(torch.allclose(out.plan_state,out2.plan_state))
    def test_illegal_rows_rejected(self):
        b,m,f,mask=self.get_inputs(); mask[1]=False
        with self.assertRaises(ValueError):self.model(b,m,f,mask)
    def test_guard_with_wdl(self):
        d=guarded_choice([8.,2.,0.],['wild','solid','bad'],
                         [(0.25,.10,.65),(.45,.20,.35),(.10,.10,.80)],0.03)
        self.assertEqual(d['move'],'solid')
        self.assertTrue(d['guard_applied'])
        self.assertFalse(d['external_wdl_verified'])
    def test_no_wdl_is_unverified(self):
        d=guarded_choice([8.,2.],['wild','solid'])
        self.assertFalse(d['guard_applied'])
    def test_guard_rejects_bad_probabilities(self):
        with self.assertRaises(ValueError):
            guarded_choice([1],['e2e4'],[(2,0,0)])

if __name__=='__main__':unittest.main()
