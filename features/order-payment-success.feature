# language: fr
Fonctionnalité: Demande de paiement - succès nominal
  En tant qu'équipe propriétaire de l'API Order
  Je veux qu'une demande de paiement avec un payload valide soit traitée
  Afin que les paiements en magasin puissent être déclenchés de manière fiable

  @smoke @nominal @contract
  Scénario: Paiement réussi avec uniquement les champs obligatoires
    Étant donné un payload de paiement avec uniquement les champs obligatoires
    Et je suis authentifié avec des identifiants valides
    Quand j'envoie la demande de paiement
    Alors le code de statut de la réponse doit être 200
    Et le statut du paiement doit être "Success"
    Et les données de la commande dans la réponse doivent correspondre à la demande
    Et les informations techniques du terminal dans la réponse doivent correspondre à la demande

  @nominal @contract
  Scénario: Paiement réussi avec un payload complet
    Étant donné un payload de paiement complet
    Et je suis authentifié avec des identifiants valides
    Quand j'envoie la demande de paiement
    Alors le code de statut de la réponse doit être 200
    Et le statut du paiement doit être "Success"
    Et les données de la commande dans la réponse doivent correspondre à la demande
    Et les données client dans la réponse doivent correspondre à la demande
    Et les informations techniques du terminal dans la réponse doivent correspondre à la demande
