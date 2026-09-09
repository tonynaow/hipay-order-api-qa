# language: fr
Fonctionnalité: Demande de paiement - authentification
  En tant qu'équipe propriétaire de l'API Order
  Je veux que les demandes non authentifiées ou invalides soient rejetées
  Afin que seuls les appelants de confiance puissent déclencher un paiement en magasin

  @negative @auth @contract
  Scénario: Aucun header Authorization n'est fourni
    Étant donné un payload de paiement avec uniquement les champs obligatoires
    Et je ne suis pas authentifié
    Quand j'envoie la demande de paiement
    Alors le code de statut de la réponse doit être 401

  @negative @auth @contract
  Scénario: Des identifiants invalides sont fournis
    Étant donné un payload de paiement avec uniquement les champs obligatoires
    Et je suis authentifié avec des identifiants invalides
    Quand j'envoie la demande de paiement
    Alors le code de statut de la réponse doit être 401
